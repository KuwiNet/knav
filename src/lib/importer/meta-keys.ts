/**
 * WordPress postmeta 键名探测器（只在导入时用）。
 *
 * 老站多是 WordPress + OneNav 主题（v5.5x），站点信息放在 postmeta 里，
 * 键名是 OneNav 私有的：网址 _sites_link、图标 _thumbnail、简介 _sites_sescribe、
 * 浏览量 views、点赞 _like_count，下载信息在 app_down_list（PHP 序列化）里。
 *
 * 但 OneNav 版本不一，用户也常装插件改字段名，所以这里在扫描来源时
 * 按「已知键名优先、按值形态兜底猜测」的规则现场识别一遍。
 * 输入是 postmeta 行——直连源库查出来的和备份文件里解析出来的是同一种形状。
 */

export interface MetaKeys {
  siteUrl: string;
  siteIcon: string;
  siteDesc: string;
  sitePreview: string;
  siteOrder: string;
  spareLinks: string;

  appName: string;
  appIcon: string;
  appDesc: string;
  appPlatform: string;
  appDownList: string;
  downFormal: string;
  downUrlList: string;
  downSize: string;
  downVersion: string;
  downPreview: string;

  views: string;
  likes: string;
  star: string;
  downCount: string;
}

/** OneNav 线上库实际使用的键名 */
const KNOWN: MetaKeys = {
  siteUrl: "_sites_link",
  siteIcon: "_thumbnail",
  siteDesc: "_sites_sescribe",
  sitePreview: "_sites_preview",
  siteOrder: "_sites_order",
  spareLinks: "_spare_sites_link",

  appName: "_app_name",
  appIcon: "_app_ico",
  appDesc: "_app_sescribe",
  appPlatform: "_app_platform",
  appDownList: "app_down_list",
  downFormal: "_down_formal",
  downUrlList: "_down_url_list",
  downSize: "_down_size",
  downVersion: "_down_version",
  downPreview: "_down_preview",

  views: "views",
  likes: "_like_count",
  star: "_star_count",
  downCount: "_down_count",
};

/** 兜底探测用的候选键名（按偏好排序） */
const CANDIDATES: Record<keyof MetaKeys, string[]> = {
  siteUrl: ["_sites_link", "_url", "sites_url", "_site_url"],
  siteIcon: ["_thumbnail", "_sites_ico", "_sites_image", "_thumbnail_id"],
  siteDesc: ["_sites_sescribe", "_sites_describe", "_sites_description"],
  sitePreview: ["_sites_preview"],
  siteOrder: ["_sites_order"],
  spareLinks: ["_spare_sites_link"],

  appName: ["_app_name"],
  appIcon: ["_app_ico", "_app_icon"],
  appDesc: ["_app_sescribe", "_app_describe"],
  appPlatform: ["_app_platform"],
  appDownList: ["app_down_list", "_app_versions"],
  downFormal: ["_down_formal"],
  downUrlList: ["_down_url_list"],
  downSize: ["_down_size"],
  downVersion: ["_down_version"],
  downPreview: ["_down_preview"],

  views: ["views", "post_views_count", "_views"],
  likes: ["_like_count", "post_like", "_likes"],
  star: ["_star_count", "_star"],
  downCount: ["_down_count"],
};

function isUrlLike(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

function isImageLike(v: string): boolean {
  if (isUrlLike(v)) return /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(v);
  return /^\/wp-content\/.*\.(png|jpe?g|webp|gif|svg)$/i.test(v);
}

function isNumeric(v: string): boolean {
  return /^\d+$/.test(v.trim());
}

/**
 * 探测来源里的 meta 键名。
 *
 * 按 (key,value) 去重后统计值形态，口径跟原来 SQL 里的 GROUP BY 一致；
 * 最多统计 4000 组，再多对判断也没意义。
 */
export function probeMetaKeys(rows: Record<string, any>[]): MetaKeys {
  const stat = new Map<
    string,
    { url: number; image: number; numeric: number; total: number }
  >();
  const present = new Set<string>();
  const seen = new Set<string>();

  for (const r of rows) {
    const key = String(r.meta_key ?? "");
    if (!key || key.startsWith("__")) continue;
    if (key === "_edit_lock" || key === "_edit_last") continue;
    const value = String(r.meta_value ?? "");
    if (value.length >= 2000) continue;

    const group = `${key}\u0000${value}`;
    if (seen.has(group)) continue;
    if (seen.size >= 4000) break;
    seen.add(group);

    present.add(key);
    const s = stat.get(key) ?? { url: 0, image: 0, numeric: 0, total: 0 };
    s.total++;
    if (isUrlLike(value)) s.url++;
    if (isImageLike(value)) s.image++;
    if (isNumeric(value)) s.numeric++;
    stat.set(key, s);
  }

  const keys: MetaKeys = { ...KNOWN };
  for (const field of Object.keys(CANDIDATES) as (keyof MetaKeys)[]) {
    const known = KNOWN[field];
    if (present.has(known)) continue;
    const guess = guessKey(field, stat);
    if (guess) keys[field] = guess;
  }
  return keys;
}

/** 按值形态兜底猜测某个 meta 键 */
function guessKey(
  field: keyof MetaKeys,
  stat: Map<string, { url: number; image: number; numeric: number; total: number }>
): string | null {
  const entries = [...stat.entries()];

  if (field === "siteUrl") {
    const cands = entries
      .filter(([, s]) => s.url >= 3 && s.url > s.image)
      .filter(([k]) => !/ico|image|logo|thumb|avatar|cover|qr|preview/i.test(k))
      .sort((a, b) => b[1].url - a[1].url);
    return cands[0]?.[0] ?? null;
  }

  if (field === "siteIcon" || field === "appIcon") {
    const cands = entries.filter(([, s]) => s.image >= 2).sort((a, b) => b[1].image - a[1].image);
    if (cands.length === 0) return null;
    const prefer = cands.find(([k]) =>
      field === "appIcon" ? /app_ico|app_icon/i.test(k) : /ico|thumb|favicon|logo/i.test(k)
    );
    return (prefer ?? cands[0])[0];
  }

  if (field === "views") {
    return entries.find(([k, s]) => /view/i.test(k) && s.numeric > 0)?.[0] ?? null;
  }
  if (field === "likes") {
    return entries.find(([k, s]) => /like/i.test(k) && s.numeric > 0)?.[0] ?? null;
  }
  if (field === "star") {
    return entries.find(([k, s]) => /star/i.test(k) && s.numeric > 0)?.[0] ?? null;
  }
  if (field === "downCount") {
    return entries.find(([k, s]) => /down_count/i.test(k) && s.numeric > 0)?.[0] ?? null;
  }

  return null;
}
