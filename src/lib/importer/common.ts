import { phpArrayToList, phpUnserialize } from "../php";

/**
 * 导入时共用的清洗与归一化逻辑。
 *
 * 老站的字段写法五花八门：平台叫「安卓版」「Windows X64」，
 * 镜像按钮名有时候是空的。这里统一归一化，导入后的数据才干净。
 */

/** 去掉 HTML 标签，只留纯文本 */
export function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 老站的平台写法归一到常用平台名；认不出来的原样保留。
 * 空字符串表示「不限」。
 */
const PLATFORM_ALIAS: Array<[RegExp, string]> = [
  [/安卓|android/i, "Android"],
  [/ios|苹果|iphone|ipad|app ?store/i, "iOS"],
  [/win(dows)?/i, "Windows"],
  [/mac ?os|macos|os ?x|macintosh/i, "macOS"],
  [/openwrt|open-?wrt|lede/i, "OpenWrt"],
  [/linux/i, "Linux"],
  [/harmony|鸿蒙/i, "HarmonyOS"],
  [/^web|网页|在线|浏览器/i, "Web"],
];

/** 从一段自由文本里判断平台（先按别名表匹配，再兜底看有没有关键词） */
export function normalizePlatform(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  for (const [re, name] of PLATFORM_ALIAS) {
    if (re.test(s)) return name;
  }
  return s;
}

/** 架构归一化：认不出来的原样保留，空串表示不限 */
const ARCH_ALIAS: Array<[RegExp, string]> = [
  [/apple ?silicon|arm64|armv8|aarch64/i, "ARM64"],
  [/x86_64|x64|amd64|64 ?bit/i, "x64"],
  [/^x86$|i386|i686|32 ?bit/i, "x86"],
  [/mips64/i, "mips64"],
  [/mipsel/i, "mipsel"],
  [/mips/i, "mips"],
  [/riscv/i, "riscv64"],
  [/universal|all ?in ?one|通用/i, "universal"],
];

export function normalizeArch(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  for (const [re, name] of ARCH_ALIAS) {
    if (re.test(s)) return name;
  }
  return s;
}

/** 按地址特征兜底一个镜像名（老站按钮名偶尔是空的） */
const MIRROR_HINTS: Array<[RegExp, string]> = [
  [/pan\.baidu\.com/i, "百度网盘"],
  [/123(?:68|pan|86)\./i, "123网盘"],
  [/aliyundrive|alipan\.com/i, "阿里云盘"],
  [/cloud\.189\.cn/i, "天翼云盘"],
  [/pan\.quark\.cn/i, "夸克网盘"],
  [/lanzou[a-z]*\.com/i, "蓝奏云"],
  [/apps\.apple\.com|itunes\.apple\.com/i, "App Store"],
  [/play\.google\.com/i, "Google Play"],
  [/appgallery\.huawei\.com/i, "App Gallery"],
  [/apps\.apple|cn\.oppo\.com|app\.mi\.com|a\.app\.taobao/i, "应用商店"],
  [/github\.com/i, "GitHub"],
  [/gitee\.com/i, "Gitee"],
];

export function mirrorNameFromUrl(url: string): string {
  for (const [re, name] of MIRROR_HINTS) {
    if (re.test(url)) return name;
  }
  return "官方下载";
}

/**
 * 把 OneNav 的 app_down_list（PHP 序列化数组）拆成「平台版本 + 镜像链接」。
 *
 * 老站的结构：
 *   a:1:{i:0;a:12:{s:11:"app_version";s:8:"17.45.36";s:8:"app_size";s:6:"50MB";
 *                  s:8:"down_url";a:2:{i:0;a:4:{
 *                    s:13:"down_btn_name";s:12:"官网下载";
 *                    s:12:"down_btn_url";s:17:"https://...";
 *                    s:13:"down_btn_info";s:9:"安卓版";} ...}}}}
 *
 * 同一平台下的多个按钮归到一个平台版本下（老站常见：安卓版给官网 + 应用宝两条）。
 */
export interface ParsedDownload {
  platform: string;
  arch: string;
  version: string;
  fileSize: string;
  note: string;
  mirrors: { name: string; url: string; fileSize: string; note: string }[];
}

export function parseAppDownList(raw: string): ParsedDownload[] {
  const list = phpArrayToList(phpUnserialize(raw)).filter(
    (v: any) => v && typeof v === "object"
  );
  if (list.length === 0) return [];

  const out: ParsedDownload[] = [];
  for (const v of list) {
    const buttons = phpArrayToList(v.down_url)
      .filter((b: any) => b && typeof b === "object")
      .map((b: any) => ({
        name: String(b.down_btn_name ?? "").trim(),
        url: String(b.down_btn_url ?? "").trim(),
        platform: normalizePlatform(String(b.down_btn_info ?? b.down_btn_tqm ?? "")),
      }))
      .filter((b: { url: string }) => b.url);
    if (buttons.length === 0) continue;

    const byPlatform = new Map<string, typeof buttons>();
    for (const b of buttons) {
      const key = b.platform || "通用";
      if (!byPlatform.has(key)) byPlatform.set(key, []);
      byPlatform.get(key)!.push(b);
    }

    const version = String(v.app_version ?? "").trim();
    const fileSize = String(v.app_size ?? "").trim();
    const note = stripTags(String(v.version_describe ?? "")).slice(0, 300);

    for (const [platform, btns] of byPlatform.entries()) {
      out.push({
        platform,
        arch: "",
        version,
        fileSize,
        note,
        mirrors: btns.map((b) => ({
          name: b.name || mirrorNameFromUrl(b.url),
          url: b.url,
          fileSize: "",
          note: "",
        })),
      });
    }
  }
  return out;
}

/**
 * 把 OneNav 的 _spare_sites_link（PHP 序列化数组）拆成备用链接。
 */
export function parseSpareLinks(raw: string): { name: string; url: string; note: string }[] {
  const list = phpArrayToList(phpUnserialize(raw)).filter(
    (v: any) => v && typeof v === "object"
  );
  return list
    .map((v: any) => ({
      name: String(v.name ?? v.link_name ?? "").trim(),
      url: String(v.url ?? v.link ?? v.sites_link ?? "").trim(),
      note: String(v.note ?? v.des ?? "").trim(),
    }))
    .filter((l) => l.url);
}

/** URL 归一化：去掉协议尾巴的斜杠、去掉 www 前缀之外的噪音；空值返回空串 */
export function cleanUrl(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https:${s}`;
  return s;
}

/**
 * 把来源库里存的素材路径补成绝对地址。
 *
 * 来源站的图标/封面常写成 `/wp-content/uploads/2022/02/a.png` 这种相对路径，
 * 补上来源站地址后导入进 knav 才是能直接访问的地址，
 * 不用在 knav 里再配一个「素材来源站点」。
 */
export function absoluteAssetUrl(raw: string, siteUrl: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s) || /^\/\//.test(s)) return cleanUrl(s);
  if (/^(data|blob):/i.test(s)) return s;

  const base = (siteUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) return s.startsWith("/") ? s : `/${s}`;
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

/**
 * 把正文里的相对图片地址补成绝对地址。
 *
 * WordPress 正文里的图片常写成 `/wp-content/uploads/...`，
 * 直接搬到 knav 会 404，按来源站地址补全才显示得出来。
 */
export function rewriteRelativeAssets(html: string, siteUrl: string): string {
  const base = (siteUrl ?? "").trim().replace(/\/+$/, "");
  if (!base || !html) return html ?? "";
  return html.replace(
    /(\ssrc\s*=\s*["'])([^"']+)(["'])/gi,
    (match, pre: string, url: string, post: string) => {
      const u = url.trim();
      if (!u || /^(https?:)?\/\//i.test(u) || /^data:/i.test(u)) return match;
      return `${pre}${absoluteAssetUrl(u, base)}${post}`;
    }
  );
}

/** slug 化（与后台新建分类时用的规则一致） */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}
