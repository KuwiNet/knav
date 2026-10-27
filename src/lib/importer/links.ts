import { absoluteAssetUrl, stripTags } from "./common";
import {
  cleanExternalUrl,
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
import type { ImportCategory, ImportContent, ImportSnapshot } from "./types";

/**
 * 通用 links 导航库 → 快照。
 *
 * 没有 CMS 特征、但库里有 links / sites / bookmarks 表的，按网址收藏导入。
 * 列名尽量宽松：name/title/sitename、url/siteurl/link、icon/logo…
 * 分类表若存在就保留父子关系；只有一列分类名时按名称生成分类。
 */

export function buildLinksSnapshot(
  tables: TableMap,
  opts: {
    sourceLabel?: string;
    linkTable: string;
    categoryTable?: string;
  }
): ImportSnapshot {
  const linkRows = tableRows(tables, opts.linkTable);
  const catRows = opts.categoryTable ? tableRows(tables, opts.categoryTable) : [];
  const optionRows = collectOptionRows(tables);

  const sourceSiteUrl = siteBase(
    optionValue(optionRows, ["site_url", "siteurl", "home_url", "blog_url", "homeurl"])
  );

  const categories: ImportCategory[] = [];
  const catIdMap = new Map<string, number>(); // 原始分类 ID/名称 → 快照分类 ID
  const catIds = new Set<number>();

  for (const r of catRows) {
    const id = pickNum(r, "id", "cid", "cate_id", "category_id");
    if (!id) continue;
    catIds.add(id);
    const name = pick(r, "name", "title", "cate_name", "category_name", "sortname");
    catIdMap.set(String(id), id);
    categories.push({
      sourceId: id,
      parentSourceId: pickNum(r, "parent_id", "pid", "parent"),
      name: name || `分类 ${id}`,
      slug: pick(r, "slug", "alias", "cate_alias"),
      description: stripTags(pick(r, "description", "desc", "intro", "note")),
      icon: absoluteAssetUrl(pick(r, "icon", "logo", "image", "cover"), sourceSiteUrl),
      count: 0,
    });
  }

  // 没有分类表，但 links 表里有一列分类名：按文字生成虚拟分类
  if (categories.length === 0) {
    const byName = new Map<string, number>();
    let nextId = -100;
    for (const r of linkRows) {
      const name = pick(r, "category", "cate_name", "category_name", "sortname", "group");
      if (!name || /^\d+$/.test(name)) continue;
      if (!byName.has(name)) {
        const id = nextId--;
        byName.set(name, id);
        categories.push({
          sourceId: id,
          parentSourceId: 0,
          name,
          slug: "",
          description: "从链接表的分类字段生成",
          icon: "",
          count: 0,
        });
      }
    }
    for (const [name, id] of byName) catIdMap.set(name.toLowerCase(), id);
  }

  const contents: ImportContent[] = [];
  const countByCat = new Map<number, number>();

  linkRows.forEach((r, index) => {
    if (isHidden(r)) return;

    const url = normalizeUrl(
      pick(r, "url", "siteurl", "link", "href", "website", "site_url", "weburl", "target_url")
    );
    if (!url) return;

    const name = pick(r, "name", "title", "sitename", "site_name", "webname", "naviname");
    const rawId = pickNum(r, "id", "lid", "link_id", "sid", "site_id");
    const categoryId = resolveCategory(r, catIdMap, catIds);

    if (categoryId) countByCat.set(categoryId, (countByCat.get(categoryId) ?? 0) + 1);

    contents.push({
      sourceId: rawId > 0 ? rawId : 5_000_000_000 + index,
      type: "site",
      title: name || hostnameOf(url),
      url,
      description: stripTags(
        pick(r, "description", "desc", "intro", "remark", "note", "summary")
      ).slice(0, 900),
      contentMd: "",
      icon: absoluteAssetUrl(
        pick(r, "icon", "logo", "favicon", "image", "thumbnail", "cover"),
        sourceSiteUrl
      ),
      cover: absoluteAssetUrl(pick(r, "cover", "banner"), sourceSiteUrl),
      categorySourceId: categoryId ?? 0,
      categorySourceIds: categoryId ? [categoryId] : [],
      tags: pick(r, "tags", "tag")
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      views: pickNum(r, "views", "view", "hits", "clicks"),
      likes: pickNum(r, "likes", "like", "stars"),
      sticky: pickNum(r, "sticky", "is_top", "top") ? 1 : 0,
      sortOrder: pickNum(r, "sort_order", "order", "ord", "taxis", "weight", "sort"),
      status: "publish",
      createdAt: toDate(pick(r, "created_at", "created", "create_time", "addtime", "ctime")),
      updatedAt: toDate(pick(r, "updated_at", "updated", "update_time", "mtime")),
      downloads: [],
      links: [],
    });
  });

  for (const c of categories) c.count = countByCat.get(c.sourceId) ?? 0;

  return {
    sourceSystem: "links",
    sourceLabel: opts.sourceLabel ?? "",
    sourceSiteUrl,
    categories,
    contents,
    taxonomies: [{ name: "category", count: categories.length }],
  };
}

/** 链接行里的分类：先按分类 ID 匹配，再按名称匹配，最后看名称列 */
function resolveCategory(
  row: Row,
  byId: Map<string, number>,
  knownIds: Set<number>
): number {
  const rawId = pickNum(row, "category_id", "cate_id", "cateid", "cat_id", "sortid", "fid");
  if (rawId && knownIds.has(rawId)) return rawId;
  if (rawId && byId.has(String(rawId))) return byId.get(String(rawId))!;

  const name = pick(row, "category", "cate_name", "category_name", "sortname", "group");
  if (name && /^\d+$/.test(name) && knownIds.has(Number(name))) return Number(name);
  if (name && byId.has(name.toLowerCase())) return byId.get(name.toLowerCase())!;
  return 0;
}

function isHidden(row: Row): boolean {
  if (pickFlag(row, "hide", "hidden", "is_hide")) return true;
  for (const key of ["status", "enabled", "visible", "is_show", "display"]) {
    const v = pick(row, key);
    if (v === "0" || v.toLowerCase() === "false" || v.toLowerCase() === "no") return true;
  }
  return false;
}

function normalizeUrl(raw: string): string {
  const s = cleanExternalUrl(raw);
  if (s) return s;
  const t = raw.trim();
  if (/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(t)) return `https://${t}`;
  return "";
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function collectOptionRows(tables: TableMap): Row[] {
  for (const [name, table] of tables) {
    if (/(?:^|_)(?:options?|config|settings)$/i.test(name)) return table.rows;
  }
  return [];
}
