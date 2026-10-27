// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  require("server-only");
}

/**
 * iconfont 样式表解析。
 *
 * 后台「站点设置 → 外观与卡片 → 图标字体 CSS」填的是一份外部样式表，
 * 典型结构（阿里 iconfont）：
 *
 *   @font-face { font-family: "io"; src: url(...); }
 *   .io { font-family: "io" !important; font-size: 16px; ... }
 *   .io-wangzhan:before { content: "\e679"; }
 *
 * 前台只拿到「图标类名」，不知道字体名就没法给元素设置 font-family，
 * 渲染出来就是空白（豆腐块）。这里把样式表抓下来解析成三样东西：
 * 字体名、基础类名、图标类名列表。
 */

export interface IconFontInfo {
  /** 样式表地址 */
  cssUrl: string;
  /** 字体名，如 "io" */
  fontFamily: string;
  /** 基础类名，如 "io"（可能为空） */
  baseClass: string;
  /** 图标类名，如 ["io-wangzhan", ...] */
  glyphs: string[];
  /** 注入页面的 CSS：给图标元素套上正确的 font-family */
  injectCss: string;
}

export interface ParsedIconFont {
  fontFamily: string;
  baseClass: string;
  glyphs: string[];
}

/** 缓存有效期（毫秒） */
const CACHE_TTL = 30 * 60 * 1000;
/** 抓取失败后的重试间隔（毫秒），避免每次请求都去撞一个坏地址 */
const FAIL_TTL = 5 * 60 * 1000;

const cache = new Map<string, { info: IconFontInfo | null; at: number }>();

/** 补全协议头：后台可能填 //at.alicdn.com/xxx.css 这种协议相对地址 */
export function normalizeIconFontUrl(url: string): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  if (u.startsWith("//")) return `https:${u}`;
  return u;
}

/**
 * 从样式表文本里解析字体名、基础类名与图标类名。
 *
 * 只认「单类名选择器 + font-family」的规则当基础类，
 * 「.xxx:before 且带 content」的规则当图标类。
 */
export function parseIconFontCss(css: string): ParsedIconFont {
  const text = css ?? "";

  // @font-face 里声明的字体名
  const families = new Set<string>();
  const faceRe = /@font-face\s*\{([^}]*)\}/gi;
  let m: RegExpExecArray | null;
  while ((m = faceRe.exec(text))) {
    const fm = /font-family\s*:\s*["']?([^;"']+?)["']?\s*(?:;|$)/i.exec(m[1]);
    if (fm) families.add(fm[1].trim());
  }

  // 基础类：形如 .io { font-family: "io" !important; ... }
  let baseClass = "";
  let fontFamily = "";
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  while ((m = ruleRe.exec(text))) {
    const fm = /font-family\s*:\s*["']?([^;"']+?)["']?\s*(?:!important)?\s*(?:;|$)/i.exec(m[2]);
    if (!fm) continue;
    const fam = fm[1].trim();
    if (!fam) continue;
    for (const raw of m[1].split(",")) {
      const cm = /^\.([A-Za-z_][\w-]*)$/.exec(raw.trim());
      if (!cm) continue;
      if (families.size && !families.has(fam)) continue;
      if (!baseClass) {
        baseClass = cm[1];
        fontFamily = fam;
      }
      break;
    }
  }

  // 没找到基础类时，退回任意一条 font-family 声明
  if (!fontFamily) {
    const anyFam = /font-family\s*:\s*["']?([^;"']+?)["']?\s*(?:!important)?\s*(?:;|$)/i.exec(text);
    if (anyFam) fontFamily = anyFam[1].trim();
  }
  if (!fontFamily && families.size) fontFamily = [...families][0];

  // 图标类：.io-xxx:before { content: "\e679"; }
  const glyphs: string[] = [];
  const seen = new Set<string>();
  const glyphRe = /\.([A-Za-z_][\w-]*)\s*(?:::before|:before)\s*\{([^}]*)\}/gi;
  while ((m = glyphRe.exec(text))) {
    if (!/content\s*:/i.test(m[2])) continue;
    const name = m[1];
    if (name === baseClass || seen.has(name)) continue;
    seen.add(name);
    glyphs.push(name);
  }

  return { fontFamily, baseClass, glyphs };
}

/** 注入页面的样式：让 .knav-iconfont 元素用上图标字体 */
export function buildIconFontCss(fontFamily: string): string {
  const fam = (fontFamily ?? "").replace(/["'\\]/g, "");
  if (!fam) return "";
  return `.knav-iconfont{font-family:"${fam}"!important;}`;
}

/** 抓取样式表文本 */
async function fetchIconFontCss(url: string): Promise<string> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "text/css,*/*;q=0.1" },
  });
  if (!res.ok) throw new Error(`iconfont css ${res.status}`);
  return await res.text();
}

/**
 * 读取并解析后台配置的 iconfont 样式表。
 *
 * 按地址缓存：改配置换地址即失效，同一地址不会反复抓取。
 */
export async function getIconFontInfo(
  cssUrl?: string
): Promise<IconFontInfo | null> {
  const url = normalizeIconFontUrl(cssUrl ?? "");
  if (!url) return null;

  const hit = cache.get(url);
  if (hit) {
    const ttl = hit.info ? CACHE_TTL : FAIL_TTL;
    if (Date.now() - hit.at < ttl) return hit.info;
  }

  let info: IconFontInfo | null = null;
  try {
    const css = await fetchIconFontCss(url);
    const parsed = parseIconFontCss(css);
    if (parsed.fontFamily || parsed.glyphs.length) {
      info = {
        cssUrl: url,
        fontFamily: parsed.fontFamily,
        baseClass: parsed.baseClass,
        glyphs: parsed.glyphs,
        injectCss: buildIconFontCss(parsed.fontFamily),
      };
    }
  } catch {
    info = null;
  }

  cache.set(url, { info, at: Date.now() });
  return info;
}
