import { execute, queryOne } from "@/lib/db";
import {
  getShortlinkConfig,
  isHttpUrl,
  shortenWithYourls,
  shortlinkReady,
} from "@/lib/shortlink";

/**
 * 网址「直达」跳转：/go/{id}
 *
 * 保存内容时已经把 YOURLS 短链写进 knav_contents.short_url，这里优先直接用；
 * 旧内容没有短链时再惰性生成一次。未配置或生成失败则直接跳原网址。
 * 文章不走这里。
 */
export const dynamic = "force-dynamic";

function redirectTo(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = Number(String(rawId ?? "").replace(/\.html?$/i, ""));
  if (!Number.isFinite(id) || id <= 0) {
    return new Response("Not Found", { status: 404 });
  }

  const row = await queryOne<{
    type: string;
    url: string;
    short_url: string;
    status: string;
  }>(
    `SELECT type, url, short_url, status
     FROM knav_contents WHERE id = ? LIMIT 1`,
    [id]
  );

  if (!row || row.type !== "site" || row.status !== "publish") {
    return new Response("Not Found", { status: 404 });
  }

  const target = (row.url ?? "").trim();
  // 原网址不合法时回到详情页，避免把用户送去 javascript: 之类的地址
  if (!isHttpUrl(target)) {
    return redirectTo(`/sites/${id}.html`);
  }

  // 保存时已生成过短链，就直接用；即使后来关掉 YOURLS 也不影响已入库的短链
  const stored = (row.short_url ?? "").trim();
  if (isHttpUrl(stored)) return redirectTo(stored);

  const cfg = await getShortlinkConfig();
  if (shortlinkReady(cfg)) {
    const res = await shortenWithYourls(target, cfg);
    if (res.ok) {
      // url 同时作为条件：编辑页保存新地址时不会把短链扣在旧地址上
      try {
        const saved = await execute(
          "UPDATE knav_contents SET short_url = ? WHERE id = ? AND url = ?",
          [res.shortUrl, id, target]
        );
        if (saved.affectedRows === 0) {
          console.warn(`[shortlink] 内容 #${id} 短链写回未命中，网址可能已变更`);
        }
      } catch (e: any) {
        console.warn(`[shortlink] 内容 #${id} 短链写回失败：${e?.message ?? e}`);
      }
      return redirectTo(res.shortUrl);
    }
    console.warn(`[shortlink] 内容 #${id} 生成短网址失败：${res.error}`);
  }

  return redirectTo(target);
}
