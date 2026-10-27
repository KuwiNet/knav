import { marked } from "marked";

/**
 * Markdown 渲染与 HTML 安全过滤。
 *
 * 这个模块同时被服务端（文章详情、投稿审核）和浏览器端（投稿实时预览）使用，
 * 所以不能引用任何服务端专用的依赖。
 */

/** 极简 HTML 安全过滤：移除 script/iframe/on* 事件属性与 javascript: 协议 */
export function sanitizeHtml(html: string): string {
  return html
    // 移除危险标签及其内容
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    // 移除事件属性
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, "")
    // 移除 javascript: 协议
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, "$1=$2#$2")
    // 移除 data: 协议（防止通过 data:text/html 执行脚本）
    .replace(/(href|src)\s*=\s*("|')\s*data:text\/html[^"']*\2/gi, "$1=$2#$2")
    .trim();
}

/**
 * 给正文里的图片补上懒加载与异步解码。
 *
 * 文章里经常有分辨率很高的截图，手机上一次性全加载会把流量和内存吃满，
 * 加上 loading="lazy" 后只有滚到可视区才请求。
 */
export function enhanceImages(html: string): string {
  if (!html) return "";
  return html.replace(/<img\b([^>]*)>/gi, (_m, attrs: string) => {
    let a = attrs;
    if (!/\bloading\s*=/i.test(a)) a += ' loading="lazy"';
    if (!/\bdecoding\s*=/i.test(a)) a += ' decoding="async"';
    // 老站正文里常有写死的宽高，限制一下免得小屏被撑破
    if (/\bwidth\s*=\s*["']?\d{4,}["']?/i.test(a)) {
      a = a.replace(/\bwidth\s*=\s*["']?\d{4,}["']?/i, 'width="100%"');
    }
    return `<img${a}>`;
  });
}

/** 同步渲染 Markdown（服务端与浏览器通用） */
export function renderMarkdownSync(md: string): string {
  const raw = marked.parse(md || "", { async: false, gfm: true, breaks: true }) as string;
  return sanitizeHtml(raw);
}

/** 提取 Markdown 摘要 */
export function excerptFromMarkdown(md: string, length = 120): string {
  const text = (md || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

/**
 * 判断正文是不是 HTML。
 *
 * 老站 OneNav 用的是可视化编辑器，wp_posts.post_content 里存的是 HTML；
 * 新系统自带的文章存的是 Markdown。渲染与摘要都要先分清这两者，
 * 否则会把 HTML 源码当 Markdown 解析，页面就乱了。
 */
export function looksLikeHtml(text: string): boolean {
  return /<(p|div|img|pre|table|h[1-6]|ul|ol|blockquote|figure|section|iframe|video)\b[^>]*>/i.test(
    text || ""
  );
}

/** 从 HTML 或 Markdown 正文里提取纯文本摘要 */export function excerptFromContent(text: string, length = 120): string {
  const raw = text || "";
  if (!looksLikeHtml(raw)) return excerptFromMarkdown(raw, length);

  const plain = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > length ? `${plain.slice(0, length)}…` : plain;
}

/**
 * 取正文里的第一张图片（HTML 的 <img src> 或 Markdown 的 ![](...)）。
 * 卡片没设自定义图标时，用它当缩略图；再没有就显示标题首字母。
 */
export function firstImageFromContent(text: string): string {
  const raw = text || "";
  if (!raw) return "";

  const html = raw.match(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i);
  if (html?.[1]) return html[1];

  const md = raw.match(/!\[[^\]]*\]\(\s*([^)\s]+)/);
  if (md?.[1]) return md[1];

  return "";
}

/* ---------------------------------------------------------------- 代码块 */

/** 代码块语言别名归一，让标签更贴近常见叫法 */
const LANG_ALIAS: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  py: "python",
  rb: "ruby",
  yml: "yaml",
  md: "markdown",
  "c++": "cpp",
  "c#": "csharp",
  golang: "go",
  text: "",
  plain: "",
};

/** 转义代码正文：避免已有实体被二次转义 */
function escapeCode(s: string): string {
  return s
    .replace(/&(?![a-zA-Z#][a-zA-Z0-9]{0,9};)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return String(s || "")
    .replace(/&(?![a-zA-Z#][a-zA-Z0-9]{0,9};)/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function readClass(attrs: string): string {
  const m = String(attrs || "").match(/class\s*=\s*["']([^"']*)["']/i);
  return m ? m[1] : "";
}

/** 从 class 里识别语言：language-x / lang-x / lang:x / highlight-x / brush: x */
function detectLang(cls: string): string {
  if (!cls) return "";
  const m = cls.match(
    /(?:language|lang|highlight|brush)\s*[:_-]\s*([a-zA-Z0-9+#._-]+)/i
  );
  if (!m) return "";
  const raw = m[1].toLowerCase();
  if (raw in LANG_ALIAS) return LANG_ALIAS[raw];
  return raw;
}

export interface CodeBlockOptions {
  /** 是否输出复制按钮 */
  showCopy?: boolean;
  /** 是否输出语言标签 */
  showLang?: boolean;
}

/**
 * 把渲染好的 HTML 里的代码块统一包装成「带语言标签 + 复制按钮」的结构。
 *
 * 处理两类来源：
 *   1. Markdown 渲染出的 <pre><code class="language-x">；
 *   2. 老站 OneNav 的 HTML 正文里直接存的 <pre class="lang:x">，
 *      以及混在 HTML 里的 ``` 围栏（这类以前会原样显示成三反引号，属于"渲染不正常"）。
 *
 * 单行代码块：语言标签放在行末并垂直居中；
 * 多行代码块：语言标签放在右上角。
 */
export function enhanceCodeBlocks(
  html: string,
  opts: CodeBlockOptions = {}
): string {
  if (!html) return "";
  const showCopy = opts.showCopy !== false;
  const showLang = opts.showLang !== false;

  let out = html;

  // 1) HTML 正文里残留的 ``` 围栏，统一转成真正的代码块
  out = out.replace(
    /```([a-zA-Z0-9+#._-]*)[ \t]*\r?\n([\s\S]*?)```/g,
    (_m, lang: string, code: string) => {
      const l = detectLang(lang);
      const cls = l ? ` class="language-${escapeAttr(l)}"` : "";
      const body = escapeCode(String(code).replace(/\r?\n$/, ""));
      return `<pre${cls}><code${cls}>${body}</code></pre>`;
    }
  );

  // 2) 统一包装 <pre> 代码块
  out = out.replace(
    /<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi,
    (_m, attrs: string, inner: string) => {
      const preCls = readClass(attrs);
      const codeMatch = inner.match(/<code\b([^>]*)>([\s\S]*?)<\/code>/i);
      const codeCls = codeMatch ? readClass(codeMatch[1]) : "";
      const body = codeMatch ? codeMatch[2] : inner;

      let lang = detectLang(codeCls) || detectLang(preCls);
      if (lang in LANG_ALIAS) lang = LANG_ALIAS[lang];

      // 判断单行 / 多行
      const plain = body
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .trim();
      const isSingle = plain.length > 0 && !plain.includes("\n");

      const langBadge =
        showLang && lang ? `<span class="code-lang">${escapeAttr(lang)}</span>` : "";
      const copyBtn = showCopy
        ? `<button type="button" class="code-copy" aria-label="复制代码">复制</button>`
        : "";
      const cls = lang ? ` class="language-${escapeAttr(lang)}"` : "";
      const dataLang = lang ? ` data-lang="${escapeAttr(lang)}"` : "";

      if (isSingle) {
        return (
          `<div class="code-block is-single"${dataLang}>` +
          `<pre><code${cls}>${body}</code></pre>` +
          `<span class="code-tail">${langBadge}${copyBtn}</span>` +
          `</div>`
        );
      }
      return (
        `<div class="code-block"${dataLang}>` +
        `<div class="code-head">${langBadge}${copyBtn}</div>` +
        `<pre><code${cls}>${body}</code></pre>` +
        `</div>`
      );
    }
  );

  return out;
}
