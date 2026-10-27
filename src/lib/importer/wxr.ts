import {
  absoluteAssetUrl,
  cleanUrl,
  normalizeArch,
  normalizePlatform,
  parseAppDownList,
  parseSpareLinks,
  rewriteRelativeAssets,
  stripTags,
} from "./common";
import type {
  ImportCategory,
  ImportContent,
  ImportContentType,
  ImportSnapshot,
} from "./types";

/**
 * 解析 WordPress 导出的 WXR（eXtended RSS）文件。
 *
 * WXR 里没有数据库，只有每个 item 的 meta（wp:postmeta）和分类（category 标签），
 * 所以：
 *   - 分类没有父子关系，一律作为顶级分类导入
 *   - 分类 ID 是临时编号（负数），只用于在快照里做关联
 *   - 没有下载信息（app_down_list 一般不会进 meta 导出），软件只能导出版本号与主地址
 */

const TAG_TAXONOMIES = new Set(["post_tag", "sitetag", "tag", "tags"]);

const POST_TYPE_MAP: Record<string, ImportContentType> = {
  sites: "site",
  site: "site",
  bookmark: "site",
  post: "article",
  article: "article",
  app: "app",
  apps: "app",
  software: "app",
};

export function parseWxr(xml: string, opts: { sourceLabel?: string } = {}): ImportSnapshot {
  const items = matchAll(xml, /<item\b[^>]*>([\s\S]*?)<\/item>/g);

  // 来源站地址：WXR 里在 channel 段，元素里的相对素材路径要靠它补全
  const sourceSiteUrl = (
    tagText(xml, "wp:base_site_url") ||
    tagText(xml, "wp:base_url") ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");

  const categories: ImportCategory[] = [];
  const catIdByKey = new Map<string, number>();
  const contents: ImportContent[] = [];

  let fallbackId = -1;

  for (const item of items) {
    const rawType = tagText(item, "wp:post_type") || tagText(item, "post_type");
    const type = POST_TYPE_MAP[rawType] ?? "article";
    const status = tagText(item, "wp:status") || "publish";
    if (status === "auto-draft" || status === "inherit" || status === "revision") continue;

    const meta = parsePostMeta(item);

    // 分类：category 标签里 domain 不是标签型的那些
    let categorySourceId = 0;
    for (const c of parseCategories(item)) {
      if (TAG_TAXONOMIES.has(c.domain)) continue;
      let id = catIdByKey.get(`${c.domain}::${c.nicename}`);
      if (id === undefined) {
        id = fallbackId--;
        catIdByKey.set(`${c.domain}::${c.nicename}`, id);
        categories.push({
          sourceId: id,
          parentSourceId: 0,
          name: c.name,
          slug: c.nicename,
          description: "",
          icon: "",
          count: 0,
        });
      }
      if (!categorySourceId) categorySourceId = id;
    }

    const title = tagText(item, "title");
    const body = tagCdata(item, "content:encoded");
    const excerpt = stripTags(tagCdata(item, "excerpt:encoded"));

    const postId = Number(tagText(item, "wp:post_id")) || fallbackId--;

    const tags = parseCategories(item)
      .filter((c) => TAG_TAXONOMIES.has(c.domain))
      .map((c) => c.name)
      .filter(Boolean);

    const url = cleanUrl(
      meta.get("_sites_link") ||
        meta.get("_url") ||
        meta.get("url") ||
        meta.get("external_url") ||
        meta.get("website") ||
        (type === "site" ? tagText(item, "link") : "")
    );

    const downloads: ImportContent["downloads"] = [];
    if (type === "app") {
      const downList = meta.get("app_down_list") || meta.get("_app_versions");
      if (downList) {
        for (const d of parseAppDownList(downList)) {
          downloads.push({
            platform: d.platform,
            arch: d.arch,
            version: d.version,
            fileSize: d.fileSize,
            note: d.note,
            mirrors: d.mirrors,
          });
        }
      }
      const platform = normalizePlatform(meta.get("_app_platform") ?? meta.get("platform") ?? "");
      const version = meta.get("_down_version") ?? meta.get("version") ?? "";
      const formal = cleanUrl(meta.get("_down_formal") ?? meta.get("homepage") ?? "");
      if (downloads.length === 0 && (platform || version || formal)) {
        downloads.push({
          platform,
          arch: normalizeArch(meta.get("arch") || meta.get("architecture") || ""),
          version: version || "",
          fileSize: meta.get("_down_size") || meta.get("file_size") || "",
          note: "",
          mirrors: formal ? [{ name: "官网", url: formal, fileSize: "", note: "" }] : [],
        });
      }
    }

    const links = [];
    const spare = meta.get("_spare_sites_link");
    if (spare) links.push(...parseSpareLinks(spare));

    contents.push({
      sourceId: postId,
      type,
      title: title || stripTags(body).slice(0, 80),
      url,
      description: (excerpt || stripTags(meta.get("_sites_sescribe") || "")).slice(0, 900),
      contentMd: type === "article" ? rewriteRelativeAssets(body, sourceSiteUrl) : "",
      icon: absoluteAssetUrl(
        meta.get("_thumbnail") || meta.get("_app_ico") || meta.get("icon") || "",
        sourceSiteUrl
      ),
      cover: absoluteAssetUrl(
        meta.get("_sites_preview") || meta.get("_down_preview") || "",
        sourceSiteUrl
      ),
      categorySourceId,
      tags,
      views: Number(meta.get("views") || meta.get("post_views_count")) || 0,
      likes: Number(meta.get("_like_count") || meta.get("post_like")) || 0,
      sticky: 0,
      sortOrder: 0,
      status,
      createdAt: tagText(item, "wp:post_date") || tagText(item, "pubDate"),
      updatedAt: tagText(item, "wp:post_modified") || tagText(item, "pubDate"),
      downloads,
      links,
    });
  }

  return {
    sourceSystem: "wordpress",
    sourceLabel: opts.sourceLabel ?? "",
    sourceSiteUrl,
    categories,
    contents,
    taxonomies: [],
  };
}

/* ------------------------------------------------------------- XML 小工具 */

function matchAll(src: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = r.exec(src)) !== null) {
    out.push(m[1]);
    if (m.index === r.lastIndex) r.lastIndex++;
  }
  return out;
}

/** 取第一个匹配标签的内部文本 */
function tagText(src: string, tag: string): string {
  const re = new RegExp(`<${escapeRe(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRe(tag)}>`);
  const m = src.match(re);
  if (!m) return "";
  return decodeEntities(decodeCdata(m[1])).trim();
}

/** 取第一个匹配标签的内部原文（不解码实体，保留 HTML） */
function tagCdata(src: string, tag: string): string {
  const re = new RegExp(`<${escapeRe(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRe(tag)}>`);
  const m = src.match(re);
  if (!m) return "";
  return decodeCdata(m[1]);
}

function decodeCdata(s: string): string {
  const t = s.trim();
  if (t.startsWith("<![CDATA[") && t.endsWith("]]>")) {
    return t.slice(9, -3);
  }
  return s;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 解析 item 里的 wp:postmeta 块 */
function parsePostMeta(item: string): Map<string, string> {
  const map = new Map<string, string>();
  const blocks = matchAll(item, /<wp:postmeta\b[^>]*>([\s\S]*?)<\/wp:postmeta>/g);
  for (const block of blocks) {
    const keys = matchAll(block, /<wp:meta_key\b[^>]*>([\s\S]*?)<\/wp:meta_key>/g);
    const values = matchAll(block, /<wp:meta_value\b[^>]*>([\s\S]*?)<\/wp:meta_value>/g);
    for (let i = 0; i < keys.length; i++) {
      const k = decodeEntities(decodeCdata(keys[i])).trim();
      if (!k) continue;
      if (map.has(k)) continue;
      map.set(k, values[i] ? decodeCdata(values[i]) : "");
    }
  }
  return map;
}

/** 解析 item 里的 category 标签 */
function parseCategories(item: string): { domain: string; nicename: string; name: string }[] {
  const out: { domain: string; nicename: string; name: string }[] = [];
  const re = /<category\b([^>]*)>([\s\S]*?)<\/category>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(item)) !== null) {
    const attrs = m[1];
    const domain = attrValue(attrs, "domain") || "category";
    const nicename = attrValue(attrs, "nicename");
    const name = decodeEntities(decodeCdata(m[2])).trim();
    out.push({ domain, nicename: nicename || name, name: name || nicename });
  }
  return out;
}

function attrValue(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  if (m) return m[1];
  const m2 = attrs.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i"));
  return m2 ? m2[1] : "";
}
