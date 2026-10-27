// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  require("server-only");
}

/**
 * 抓取目标站点的公开信息（标题 / 简介 / 图标）。
 *
 * 后台添加网址时，只要填了地址点一下「获取」，
 * 就自动把站名、简介、logo 填好，省得一个个手敲。
 *
 * 只取页面里公开的元信息，不执行任何页面脚本。
 */

export interface SiteMeta {
  /** 站点标题 */
  title: string;
  /** 站点简介 */
  description: string;
  /** 图标地址（favicon / apple-touch-icon） */
  icon: string;
  /** 封面图（og:image） */
  cover: string;
  /** 最终访问的地址（跟随跳转后） */
  finalUrl: string;
}

const FETCH_TIMEOUT = 10000;
const MAX_HTML = 800 * 1024;

/**
 * 伪装成浏览器打开页面时的请求头。
 * 有些站点只按 UA / Sec-Fetch 判断，补齐这些能减少误伤；
 * Cloudflare 的人机验证（挑战页）无法用请求头绕过，只能给出可操作的提示。
 */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "sec-ch-ua":
    '"Chromium";v="141", "Not?A_Brand";v="24", "Google Chrome";v="141"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

type FetchedPage = { status: number; finalUrl: string; html: string };

async function requestPage(url: string, signal: AbortSignal): Promise<FetchedPage> {
  const res = await fetch(url, {
    signal,
    redirect: "follow",
    headers: BROWSER_HEADERS,
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return { status: res.status, finalUrl: res.url || url, html: "" };
  }
  const buf = await res.text();
  return {
    status: res.status,
    finalUrl: res.url || url,
    html: buf.slice(0, MAX_HTML),
  };
}

/** 裸域和 www 有时是两套防护策略，403 时换一个再试 */
function alternateHost(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.startsWith("www.")
      ? u.hostname.slice(4)
      : `www.${u.hostname}`;
    return u.toString();
  } catch {
    return null;
  }
}

function isChallengePage(html: string): boolean {
  return (
    /<title>\s*Just a moment/i.test(html) ||
    /cf-chl|challenge-platform|Attention Required!?\s*\|\s*Cloudflare/i.test(html)
  );
}

/** 补全协议头 */
export function normalizeUrl(raw: string): string {
  let u = (raw || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

/** 取出 <meta> / <link> 标签里的属性 */
function attr(tag: string, name: string): string {
  const re = new RegExp(
    `${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    "i"
  );
  const m = tag.match(re);
  if (!m) return "";
  return (m[2] ?? m[3] ?? m[4] ?? "").trim();
}

/** 把页面里的相对地址补成绝对地址 */
function absolute(src: string, base: string): string {
  if (!src) return "";
  if (/^(https?:)?\/\//i.test(src)) {
    return src.startsWith("//") ? `https:${src}` : src;
  }
  if (src.startsWith("data:")) return "";
  try {
    return new URL(src, base).toString();
  } catch {
    return "";
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)));
}

/**
 * 抓取站点信息。
 * 失败时返回 error，不抛异常（后台表单要能直接把错误显示出来）。
 */
export async function fetchSiteMeta(
  rawUrl: string
): Promise<{ ok: true; meta: SiteMeta } | { ok: false; error: string }> {
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, error: "请先填写网址" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "网址格式不正确" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "只支持 http / https 地址" };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  let page: FetchedPage;
  try {
    page = await requestPage(url, ctrl.signal);
    if ((page.status === 403 || page.status === 503) && !ctrl.signal.aborted) {
      const alt = alternateHost(url);
      if (alt) {
        try {
          const retry = await requestPage(alt, ctrl.signal);
          if (retry.status < 400 && !isChallengePage(retry.html)) page = retry;
        } catch {
          /* 换域名也失败时，按第一次的结果提示 */
        }
      }
    }
  } catch (e) {
    const msg = (e as Error)?.name === "AbortError" ? "请求超时" : (e as Error)?.message;
    return { ok: false, error: `无法访问该站点：${msg}` };
  } finally {
    clearTimeout(timer);
  }

  if (
    page.status === 403 ||
    page.status === 503 ||
    isChallengePage(page.html)
  ) {
    return {
      ok: false,
      error:
        `对方站点返回 HTTP ${page.status}，常见原因是 Cloudflare 等访问验证拦截了服务器。` +
        "请在浏览器打开该站点手动填写标题和简介，图标可在下方「自定义图标」里直接上传。",
    };
  }
  if (page.status < 200 || page.status >= 300) {
    return { ok: false, error: `对方站点返回 ${page.status}` };
  }

  const html = page.html;
  const base = page.finalUrl;

  // 标题：og:title 优先，其次 <title>
  let title = "";
  const ogTitle = html.match(/<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*>/i);
  if (ogTitle) title = decodeEntities(attr(ogTitle[0], "content"));
  if (!title) {
    const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (t) title = decodeEntities(t[1]).trim();
  }

  // 简介：description → og:description → twitter:description
  let description = "";
  const descTag =
    html.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*>/i) ??
    html.match(/<meta\b[^>]*property\s*=\s*["']og:description["'][^>]*>/i) ??
    html.match(/<meta\b[^>]*name\s*=\s*["']twitter:description["'][^>]*>/i);
  if (descTag) description = decodeEntities(attr(descTag[0], "content"));

  // 封面：og:image → twitter:image
  let cover = "";
  const imgTag =
    html.match(/<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*>/i) ??
    html.match(/<meta\b[^>]*name\s*=\s*["']twitter:image["'][^>]*>/i);
  if (imgTag) cover = absolute(decodeEntities(attr(imgTag[0], "content")), base);

  // 图标：apple-touch-icon → icon → shortcut icon → 站点根目录 /favicon.ico
  let icon = "";
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    const rel = attr(tag, "rel").toLowerCase();
    if (!rel) continue;
    const isIcon =
      rel.includes("icon") || rel.includes("apple-touch") || rel.includes("shortcut");
    if (!isIcon) continue;
    const href = decodeEntities(attr(tag, "href"));
    if (!href) continue;
    // apple-touch-icon 一般比 favicon 清晰，优先用它
    if (rel.includes("apple-touch")) {
      icon = absolute(href, base);
      break;
    }
    if (!icon) icon = absolute(href, base);
  }
  if (!icon) {
    try {
      icon = new URL("/favicon.ico", base).toString();
    } catch {
      icon = "";
    }
  }

  // 标题太长时截断（老站标题常带一长串后缀）
  if (title.length > 80) title = `${title.slice(0, 78)}…`;

  return {
    ok: true,
    meta: {
      title,
      description,
      icon,
      cover,
      finalUrl: page.finalUrl,
    },
  };
}
