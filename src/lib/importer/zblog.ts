import { phpUnserialize } from "../php";
import { absoluteAssetUrl, cleanUrl, rewriteRelativeAssets, stripTags } from "./common";
import {
  cleanExternalUrl,
  idList,
  LINK_SOURCE_OFFSET,
  optionValue,
  pick,
  pickFlag,
  pickNum,
  siteBase,
  tableRows,
  toDate,
  type Row,
  type TableMap,
} from "./tables";
import type {
  ImportCategory,
  ImportContent,
  ImportSnapshot,
} from "./types";

/**
 * Z-BlogPHP → 快照。
 *
 * 文章在 zbp_post，分类在 zbp_category，标签在 zbp_tag（文章里用 `{1}{2}` 记 ID）。
 * 友情链接没有独立表，存在 zbp_module 的 link 模块里（HTML 或序列化数组），
 * 尽力解析出 <a href> 的地址按网址导入。
 */

const LINK_CATEGORY_ID = -1;

const ZB_DRAFT = new Set(["1", "2"]);

export function buildZblogSnapshot(
  tables: TableMap,
  prefix: string,
  opts: { sourceLabel?: string } = {}
): ImportSnapshot {
  const postRows = tableRows(tables, `${prefix}post`);
  const catRows = tableRows(tables, `${prefix}category`);
  const tagRows = tableRows(tables, `${prefix}tag`);
  const moduleRows = tableRows(tables, `${prefix}module`);
  const configRows = tableRows(tables, `${prefix}config`);

  const sourceSiteUrl = siteBase(zblogOption(configRows, ["ZC_BLOG_HOST"]));

  const tagName = new Map<number, string>();
  for (const r of tagRows) {
    const id = pickNum(r, "tag_ID", "tag_id", "id");
    if (id) tagName.set(id, pick(r, "tag_Name", "tag_name", "name"));
  }

  const categories: ImportCategory[] = [];
  for (const r of catRows) {
    const id = pickNum(r, "cate_ID", "cate_id", "id");
    if (!id) continue;
    const meta = metaMap(r);
    categories.push({
      sourceId: id,
      parentSourceId: pickNum(r, "cate_ParentID", "cate_parentid", "parent_id"),
      name: pick(r, "cate_Name", "cate_name", "name") || `分类 ${id}`,
      slug: pick(r, "cate_Alias", "cate_alias", "alias"),
      description: stripTags(pick(r, "cate_Intro", "cate_intro", "intro")),
      icon: absoluteAssetUrl(metaGet(meta, "icon", "logo", "thumbnail", "image"), sourceSiteUrl),
      count: pickNum(r, "cate_Count", "cate_count", "count"),
    });
  }

  const contents: ImportContent[] = [];
  for (const r of postRows) {
    const id = pickNum(r, "log_ID", "log_id", "id");
    if (!id) continue;

    const rawType = pick(r, "log_Type", "log_type", "type");
    if (rawType && rawType !== "0" && rawType !== "1") continue;

    const meta = metaMap(r);
    const text = pick(r, "log_Content", "log_content", "content");
    const statusRaw = pick(r, "log_Status", "log_status", "status");
    const status =
      statusRaw === "2" ? "pending" : ZB_DRAFT.has(statusRaw) ? "draft" : "publish";

    contents.push({
      sourceId: id,
      type: "article",
      title:
        pick(r, "log_Title", "log_title", "title") ||
        stripTags(text).slice(0, 80) ||
        `内容 ${id}`,
      url: cleanExternalUrl(metaGet(meta, "url", "link", "siteurl", "website", "href")),
      description: stripTags(pick(r, "log_Intro", "log_intro", "intro")).slice(0, 900),
      contentMd: rewriteRelativeAssets(text, sourceSiteUrl),
      icon: absoluteAssetUrl(metaGet(meta, "icon", "logo", "_thumbnail", "favicon"), sourceSiteUrl),
      cover: absoluteAssetUrl(
        metaGet(meta, "cover", "thumbnail", "_thumbnail", "image", "banner"),
        sourceSiteUrl
      ),
      categorySourceId: pickNum(r, "log_CateID", "log_cateid", "category_id"),
      categorySourceIds: pickNum(r, "log_CateID", "log_cateid", "category_id")
        ? [pickNum(r, "log_CateID", "log_cateid", "category_id")]
        : [],
      tags: zblogTags(pick(r, "log_Tag", "log_tag", "tag"), tagName),
      views: pickNum(r, "log_ViewNums", "log_viewnums", "views"),
      likes: 0,
      sticky: pickFlag(r, "log_IsTop", "log_istop") ? 1 : 0,
      sortOrder: 0,
      status,
      createdAt: toDate(pick(r, "log_CreateTime", "log_createtime", "create_time")),
      updatedAt: toDate(
        pick(r, "log_UpdateTime", "log_updatetime", "update_time") ||
          pick(r, "log_CreateTime", "log_createtime", "create_time")
      ),
      downloads: [],
      links: [],
    });
  }

  /* ---------------------------------------------------------- 友情链接模块 */
  const linkModule = moduleRows.find(
    (r) => pick(r, "mod_FileName", "mod_filename").toLowerCase() === "link"
  );
  const moduleLinks = linkModule
    ? parseLinkModule(pick(linkModule, "mod_Content", "mod_content"), sourceSiteUrl)
    : [];

  if (moduleLinks.length > 0) {
    categories.push({
      sourceId: LINK_CATEGORY_ID,
      parentSourceId: 0,
      name: "链接",
      slug: "links",
      description: "从 Z-Blog 链接模块导入",
      icon: "",
      count: moduleLinks.length,
    });

    moduleLinks.forEach((link, index) => {
      contents.push({
        sourceId: LINK_SOURCE_OFFSET + index + 1,
        type: "site",
        title: link.name || link.url,
        url: link.url,
        description: link.note,
        contentMd: "",
        icon: link.icon,
        cover: "",
        categorySourceId: LINK_CATEGORY_ID,
        categorySourceIds: [LINK_CATEGORY_ID],
        tags: [],
        views: 0,
        likes: 0,
        sticky: 0,
        sortOrder: index,
        status: "publish",
        createdAt: "",
        updatedAt: "",
        downloads: [],
        links: [],
      });
    });
  }

  return {
    sourceSystem: "zblog",
    sourceLabel: opts.sourceLabel ?? "",
    sourceSiteUrl,
    categories,
    contents,
    taxonomies: [
      { name: "category", count: categories.length - (moduleLinks.length > 0 ? 1 : 0) },
      { name: "tag", count: tagRows.length },
    ],
  };
}

/** log_Meta / cate_Meta 是 PHP 序列化数组，取其中常见的图标与地址字段 */
function metaMap(row: Row): Map<string, string> {
  const raw = pick(row, "log_Meta", "log_meta", "cate_Meta", "cate_meta", "tag_Meta");
  const map = new Map<string, string>();
  if (!raw || !/^a:\d+:/.test(raw)) return map;
  const value = phpUnserialize(raw);
  if (!value || typeof value !== "object") return map;
  for (const [k, v] of Object.entries(value)) {
    if (v !== null && v !== undefined && typeof v !== "object") {
      map.set(k.toLowerCase(), String(v));
    }
  }
  return map;
}

function metaGet(map: Map<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const v = map.get(key.toLowerCase());
    if (v && v.trim()) return v.trim();
  }
  return "";
}

/** log_Tag 形如 `{1}{2}`；也兼容直接写标签名的情况 */
function zblogTags(raw: string, names: Map<number, string>): string[] {
  if (!raw.trim()) return [];
  const out: string[] = [];
  for (const id of idList(raw)) {
    const name = names.get(id);
    if (name) out.push(name);
  }
  if (out.length === 0) {
    for (const part of raw.split(/[{},，\s]+/)) {
      const s = part.trim();
      if (s) out.push(s);
    }
  }
  return [...new Set(out)];
}

interface ParsedLink {
  name: string;
  url: string;
  note: string;
  icon: string;
}

/** 链接模块可能是序列化数组，也可能是一段 HTML */
function parseLinkModule(raw: string, siteUrl: string): ParsedLink[] {
  if (!raw) return [];
  const out: ParsedLink[] = [];

  let content = raw;
  if (/^(?:a|s):\d+:/.test(content)) {
    const value = phpUnserialize(content);
    if (typeof value === "string") {
      content = value;
    } else if (value && typeof value === "object") {
      collectObjects(value, out, siteUrl);
      if (out.length > 0) return dedupe(out);
    }
  }

  for (const m of content.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = m[1];
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
    const title = /\btitle\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
    const url = cleanExternalUrl(cleanUrl(href));
    if (!url) continue;
    out.push({
      name: stripTags(m[2]) || title || url,
      url,
      note: title,
      icon: "",
    });
  }

  return dedupe(out);
}

function collectObjects(value: any, out: ParsedLink[], siteUrl: string, depth = 0): void {
  if (depth > 4 || value == null) return;
  if (Array.isArray(value)) {
    for (const v of value) collectObjects(v, out, siteUrl, depth + 1);
    return;
  }
  if (typeof value !== "object") return;

  const url = cleanExternalUrl(
    String(value.url ?? value.link ?? value.href ?? value.siteurl ?? "")
  );
  if (url) {
    out.push({
      name: String(value.name ?? value.title ?? value.sitename ?? url).trim(),
      url,
      note: String(value.intro ?? value.description ?? value.note ?? "").trim(),
      icon: absoluteAssetUrl(String(value.logo ?? value.icon ?? value.image ?? ""), siteUrl),
    });
  }
  for (const v of Object.values(value)) {
    if (v && typeof v === "object") collectObjects(v, out, siteUrl, depth + 1);
  }
}

function dedupe(list: ParsedLink[]): ParsedLink[] {
  const seen = new Set<string>();
  return list.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}

function zblogOption(rows: Row[], names: string[]): string {
  const raw = optionValue(rows, names);
  if (!raw) return "";
  if (/^s:\d+:/.test(raw)) {
    const v = phpUnserialize(raw);
    return typeof v === "string" ? v : "";
  }
  return raw.replace(/^"(.*)"$/, "$1");
}
