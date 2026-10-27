import { phpUnserialize } from "../php";
import {
  absoluteAssetUrl,
  rewriteRelativeAssets,
  stripTags,
} from "./common";
import {
  cleanExternalUrl,
  hasTable,
  LINK_SOURCE_OFFSET,
  optionValue,
  pick,
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
  ImportContentType,
  ImportSnapshot,
} from "./types";

/**
 * Typecho → 快照。
 *
 * 文章正文可能是 Markdown（带 `<!--markdown-->` 前缀）或 HTML；
 * 自定义字段里常见导航主题存的 url / icon / cover，一并读出来。
 * 链接表（Links 插件）的条目按网址导入，并附带一个「链接」分类。
 */

const LINK_CATEGORY_ID = -1;

const CATEGORY_TYPES = new Set(["category", "categories"]);
const TAG_TYPES = new Set(["tag", "tags"]);

export function buildTypechoSnapshot(
  tables: TableMap,
  prefix: string,
  opts: { sourceLabel?: string } = {}
): ImportSnapshot {
  const contentRows = tableRows(tables, `${prefix}contents`);
  const metaRows = tableRows(tables, `${prefix}metas`);
  const relRows = tableRows(tables, `${prefix}relationships`);
  const optionRows = tableRows(tables, `${prefix}options`);
  const fieldRows = hasTable(tables, `${prefix}fields`)
    ? tableRows(tables, `${prefix}fields`)
    : [];
  const linkRows = hasTable(tables, `${prefix}links`)
    ? tableRows(tables, `${prefix}links`)
    : [];

  const sourceSiteUrl = siteBase(typechoOption(optionRows, ["siteUrl", "site_url"]));

  const metaById = new Map<number, Row>();
  for (const r of metaRows) metaById.set(pickNum(r, "mid"), r);

  const categoryIds = new Set<number>();
  const categories: ImportCategory[] = [];
  for (const r of metaRows) {
    if (!CATEGORY_TYPES.has(pick(r, "type").toLowerCase())) continue;
    const id = pickNum(r, "mid");
    if (!id) continue;
    categoryIds.add(id);
    categories.push({
      sourceId: id,
      parentSourceId: pickNum(r, "parent"),
      name: pick(r, "name") || `分类 ${id}`,
      slug: pick(r, "slug"),
      description: stripTags(pick(r, "description")),
      icon: "",
      count: pickNum(r, "count"),
    });
  }

  const tagsByContent = new Map<number, string[]>();
  const catsByContent = new Map<number, number[]>();
  for (const r of relRows) {
    const cid = pickNum(r, "cid");
    const mid = pickNum(r, "mid");
    const meta = metaById.get(mid);
    if (!cid || !meta) continue;
    const type = pick(meta, "type").toLowerCase();
    if (CATEGORY_TYPES.has(type) && categoryIds.has(mid)) {
      if (!catsByContent.has(cid)) catsByContent.set(cid, []);
      catsByContent.get(cid)!.push(mid);
    } else if (TAG_TYPES.has(type)) {
      const name = pick(meta, "name");
      if (!name) continue;
      if (!tagsByContent.has(cid)) tagsByContent.set(cid, []);
      tagsByContent.get(cid)!.push(name);
    }
  }

  const fieldsByContent = new Map<number, Map<string, string>>();
  for (const r of fieldRows) {
    const cid = pickNum(r, "cid");
    const name = pick(r, "name");
    if (!cid || !name) continue;
    const raw = pick(r, "str_value", "int_value", "float_value");
    if (!fieldsByContent.has(cid)) fieldsByContent.set(cid, new Map());
    const map = fieldsByContent.get(cid)!;
    if (!map.has(name)) map.set(name, raw);
  }

  const contents: ImportContent[] = [];
  for (const r of contentRows) {
    const rawType = pick(r, "type").toLowerCase();
    if (rawType === "attachment" || rawType === "revision") continue;
    if (!["post", "page", "post_draft", "page_draft"].includes(rawType)) continue;

    const id = pickNum(r, "cid");
    if (!id) continue;

    const fields = fieldsByContent.get(id) ?? new Map<string, string>();
    const field = (...keys: string[]) => {
      for (const key of keys) {
        const v = fields.get(key);
        if (v && v.trim()) return v.trim();
      }
      return "";
    };

    let text = pick(r, "text");
    text = text.replace(/^<!--\s*markdown\s*-->/i, "");
    const isMarkdown = /^<!--\s*markdown\s*-->/i.test(pick(r, "text"));

    const type: ImportContentType = "article";
    const title = pick(r, "title") || stripTags(text).slice(0, 80) || `内容 ${id}`;

    const url = cleanExternalUrl(field("url", "link", "siteurl", "website", "href"));
    const icon = absoluteAssetUrl(field("icon", "logo", "favicon"), sourceSiteUrl);
    const cover = absoluteAssetUrl(
      field("cover", "thumbnail", "thumb", "image", "banner"),
      sourceSiteUrl
    );

    const cats = (catsByContent.get(id) ?? []).filter((mid) => categoryIds.has(mid));

    let status = pick(r, "status") || "publish";
    if (rawType.endsWith("_draft")) status = "draft";
    else if (status === "waiting") status = "pending";
    else if (status === "hidden" || status === "private") status = "draft";

    contents.push({
      sourceId: id,
      type,
      title,
      url,
      description: stripTags(text).slice(0, 900),
      contentMd: isMarkdown ? text : rewriteRelativeAssets(text, sourceSiteUrl),
      icon,
      cover,
      categorySourceId: cats[0] ?? 0,
      categorySourceIds: cats,
      tags: tagsByContent.get(id) ?? [],
      views: Number(field("views", "view", "hits")) || 0,
      likes: Number(field("likes", "like")) || 0,
      sticky: 0,
      sortOrder: pickNum(r, "order"),
      status,
      createdAt: toDate(pick(r, "created")),
      updatedAt: toDate(pick(r, "modified")),
      downloads: [],
      links: [],
    });
  }

  /* ------------------------------------------------------------ 链接表 */
  if (linkRows.length > 0) {
    categories.push({
      sourceId: LINK_CATEGORY_ID,
      parentSourceId: 0,
      name: "链接",
      slug: "links",
      description: "从 Typecho 链接表导入",
      icon: "",
      count: linkRows.length,
    });

    linkRows.forEach((r, index) => {
      const url = cleanExternalUrl(pick(r, "url", "siteurl", "link", "href"));
      if (!url) return;
      const id = pickNum(r, "lid", "id") || index + 1;
      const name = pick(r, "name", "title", "sitename") || url;
      contents.push({
        sourceId: LINK_SOURCE_OFFSET + id,
        type: "site",
        title: name,
        url,
        description: pick(r, "description", "desc", "intro", "note"),
        contentMd: "",
        icon: absoluteAssetUrl(pick(r, "logo", "icon", "image"), sourceSiteUrl),
        cover: "",
        categorySourceId: LINK_CATEGORY_ID,
        categorySourceIds: [LINK_CATEGORY_ID],
        tags: [],
        views: 0,
        likes: 0,
        sticky: 0,
        sortOrder: pickNum(r, "sort", "order", "taxis"),
        status: "publish",
        createdAt: toDate(pick(r, "created", "create_time", "addtime")),
        updatedAt: "",
        downloads: [],
        links: [],
      });
    });
  }

  return {
    sourceSystem: "typecho",
    sourceLabel: opts.sourceLabel ?? "",
    sourceSiteUrl,
    categories,
    contents,
    taxonomies: [
      { name: "category", count: categories.length - (linkRows.length > 0 ? 1 : 0) },
      { name: "tag", count: metaRows.filter((r) => TAG_TYPES.has(pick(r, "type").toLowerCase())).length },
    ],
  };
}

function typechoOption(rows: Row[], names: string[]): string {
  const raw = optionValue(rows, names);
  if (!raw) return "";
  if (/^s:\d+:/.test(raw)) {
    const v = phpUnserialize(raw);
    return typeof v === "string" ? v : "";
  }
  return raw.replace(/^"(.*)"$/, "$1");
}

