// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  require("server-only");
}
import { getSettingMap } from "./settings";
import { execute, queryOne } from "./db";

/**
 * YOURLS 短网址。
 *
 * 只为「网址」类型的直达链接生成，文章不参与。
 * 配置在「站点设置 → 短网址（YOURLS）」：API 地址 + 签名 Token。
 * 生成失败一律回退到原网址，不影响访问。
 */

export interface ShortlinkConfig {
  enabled: boolean;
  apiUrl: string;
  signature: string;
}

export async function getShortlinkConfig(): Promise<ShortlinkConfig> {
  const map = await getSettingMap();
  return {
    enabled: map.yourls_enabled === "1",
    apiUrl: (map.yourls_api_url ?? "").trim(),
    signature: (map.yourls_signature ?? "").trim(),
  };
}

/** 真正可用的配置：开关打开且地址、签名都填了 */
export function shortlinkReady(cfg: ShortlinkConfig): boolean {
  return cfg.enabled && Boolean(cfg.apiUrl) && Boolean(cfg.signature);
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export type ShortlinkResult =
  | { ok: true; shortUrl: string }
  | { ok: false; error: string };

/**
 * 从 YOURLS 响应里取出短网址。
 *
 * 正常成功响应带 shorturl；部分配置对已存在的长网址返回 409（error:url），
 * 短链只出现在 shorturl 或 url.keyword 里，也要认。
 */
function shortUrlFromResponse(data: any, apiUrl: string): string {
  const direct = typeof data?.shorturl === "string" ? data.shorturl.trim() : "";
  if (isHttpUrl(direct)) return direct;

  const keyword = String(data?.url?.keyword ?? "").trim();
  if (!keyword) return "";
  try {
    const base = new URL(apiUrl);
    const built = `${base.protocol}//${base.host}/${encodeURIComponent(keyword)}`;
    return isHttpUrl(built) ? built : "";
  } catch {
    return "";
  }
}

/**
 * 调用 YOURLS 的签名 API：action=shorturl&format=json。
 * 同一长网址 YOURLS 会返回已存在的短链，不会重复生成。
 */
export async function shortenWithYourls(
  target: string,
  cfg: ShortlinkConfig
): Promise<ShortlinkResult> {
  if (!shortlinkReady(cfg)) return { ok: false, error: "短网址未配置" };
  if (!isHttpUrl(target)) return { ok: false, error: "原网址不是 http(s) 地址" };

  let endpoint: URL;
  try {
    endpoint = new URL(cfg.apiUrl);
  } catch {
    return { ok: false, error: "YOURLS API 地址格式不正确" };
  }
  if (!isHttpUrl(endpoint.toString())) {
    return { ok: false, error: "YOURLS API 地址必须是 http(s)" };
  }
  endpoint.searchParams.set("signature", cfg.signature);
  endpoint.searchParams.set("action", "shorturl");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("url", target);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (e: any) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    return {
      ok: false,
      error: timeout ? "YOURLS 请求超时" : "YOURLS 连接失败",
    };
  }

  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    // 返回的不是 JSON（常见于地址填错、签名被 WAF 拦截）
    return { ok: false, error: `YOURLS 返回异常（HTTP ${res.status}）` };
  }

  if (data?.status === "success") {
    const shortUrl = shortUrlFromResponse(data, cfg.apiUrl);
    if (shortUrl) return { ok: true, shortUrl };
    return { ok: false, error: "YOURLS 未返回有效的短网址" };
  }

  // 网址已收录：YOURLS 常见返回 409 + code=error:url，但响应里带着现成短链
  if (String(data?.code ?? "") === "error:url") {
    const shortUrl = shortUrlFromResponse(data, cfg.apiUrl);
    if (shortUrl) return { ok: true, shortUrl };
  }

  // 原网址本身就是本 YOURLS 的短链：不用再生成，直接用
  if (String(data?.code ?? "") === "error:noloop") {
    return { ok: true, shortUrl: target };
  }

  const message = String(data?.message ?? data?.error ?? "").trim();
  return {
    ok: false,
    error: message ? `YOURLS: ${message.slice(0, 200)}` : "YOURLS 生成失败",
  };
}

/**
 * 保存网址后生成并写入短链。
 *
 * 已有短链且地址没变时直接复用；未配置 YOURLS 时返回 null（不当作错误）。
 * 生成失败只影响短链，内容本身已经保存成功，由调用方决定怎么提示。
 */
export async function saveContentShortlink(
  id: number
): Promise<ShortlinkResult | null> {
  const row = await queryOne<{ type: string; url: string; short_url: string }>(
    "SELECT type, url, short_url FROM knav_contents WHERE id = ? LIMIT 1",
    [id]
  );
  if (!row || row.type !== "site") return null;

  const target = (row.url ?? "").trim();
  if (!isHttpUrl(target)) return null;

  const existing = (row.short_url ?? "").trim();
  if (isHttpUrl(existing)) return { ok: true, shortUrl: existing };

  const cfg = await getShortlinkConfig();
  if (!shortlinkReady(cfg)) return null;

  const res = await shortenWithYourls(target, cfg);
  if (!res.ok) {
    console.warn(`[shortlink] 内容 #${id} 生成短网址失败：${res.error}`);
    return res;
  }

  // 生成期间地址可能又被改掉，带上原地址条件，避免短链扣在新网址上
  try {
    const r = await execute(
      "UPDATE knav_contents SET short_url = ? WHERE id = ? AND url = ?",
      [res.shortUrl, id, target]
    );
    if (r.affectedRows === 0) {
      console.warn(`[shortlink] 内容 #${id} 短链写回未命中，网址可能已变更`);
    }
  } catch (e: any) {
    console.warn(`[shortlink] 内容 #${id} 短链写回失败：${e?.message ?? e}`);
  }
  return res;
}
