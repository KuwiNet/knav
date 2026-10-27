// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  require("server-only");
}
import { getSettingMap } from "./settings";

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
    const shortUrl = String(data.shorturl ?? data.url ?? "").trim();
    if (isHttpUrl(shortUrl)) return { ok: true, shortUrl };
    return { ok: false, error: "YOURLS 未返回有效的短网址" };
  }

  const message = String(data?.message ?? data?.error ?? "").trim();
  return {
    ok: false,
    error: message ? `YOURLS: ${message.slice(0, 200)}` : "YOURLS 生成失败",
  };
}
