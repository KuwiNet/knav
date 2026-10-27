import { query } from "./db";

/**
 * 素材地址解析。
 *
 * 库里存的图片/图标可能是三种形态：
 *   1. http(s) 绝对地址            → 原样返回
 *   2. 协议相对地址 //xxx          → 补 https
 *   3. 站内相对路径 /uploads/xx.png → 补上站点地址前缀
 *
 * 相对路径的基准只有一个：后台「站点设置 → 站点地址」。
 * 素材随站点一起部署，地址也就跟着本站走，不做多来源兜底。
 */

let cachedBase: string | null = null;

/** 去掉末尾斜杠 */
export function normalizeOrigin(v: string | null | undefined): string {
  return (v ?? "").trim().replace(/\/+$/, "");
}

/**
 * 取素材地址基准（站点地址）。
 * 进程内缓存，设置变更时调用 resetAssetBaseCache。
 */
export async function getAssetBase(): Promise<string> {
  if (cachedBase !== null) return cachedBase;
  let siteUrl = "";
  try {
    const rows = await query<{ name: string; value: string }>(
      "SELECT name, value FROM knav_settings WHERE name = 'site_url'"
    );
    siteUrl = normalizeOrigin(rows[0]?.value);
  } catch {
    // 库里没有该表时按空基准处理
  }
  cachedBase = siteUrl;
  return cachedBase;
}

/** 设置变更后清缓存 */
export function resetAssetBaseCache(): void {
  cachedBase = null;
}

/**
 * 把库里的路径转成可直接访问的地址。
 * - 已经是 http(s) 绝对地址：原样返回
 * - 协议相对地址 //xxx：补 https
 * - 其它：按站点地址补全；站点地址为空时按站内相对路径原样返回
 */
export function resolveAssetUrl(
  path: string | null | undefined,
  base: string
): string {
  const p = (path ?? "").trim();
  if (!p) return "";
  if (p.startsWith("//")) return `https:${p}`;
  if (/^https?:\/\//i.test(p)) return p;

  const b = normalizeOrigin(base);
  if (!b) return p.startsWith("/") ? p : `/${p}`;
  return p.startsWith("/") ? `${b}${p}` : `${b}/${p}`;
}

/**
 * 前台同源资源地址：站内相对路径保持相对，由浏览器按当前访问域名取。
 *
 * favicon / LOGO 这类随本次部署一起发布的资源不能用「站点地址」拼：
 * 本地测试库里的站点地址仍指向生产域名时，浏览器会去生产域名取图标，
 * 本地刚换的图标就永远不生效。外链地址照旧原样返回。
 */
export function resolveAssetHref(path: string | null | undefined): string {
  const p = (path ?? "").trim();
  if (!p) return "";
  if (p.startsWith("//")) return `https:${p}`;
  if (/^https?:\/\//i.test(p)) return p;
  return p.startsWith("/") ? p : `/${p}`;
}

/** 批量解析：只取一次基准站点 */
export async function resolveAssetUrls(
  paths: (string | null | undefined)[]
): Promise<string[]> {
  const base = await getAssetBase();
  return paths.map((p) => resolveAssetUrl(p, base));
}
