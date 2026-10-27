import { absoluteAssetUrl, rewriteRelativeAssets, stripTags } from "./common";
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
  type TableMap,
} from "./tables";
import type {
  ImportCategory,
  ImportContent,
  ImportSnapshot,
} from "./types";

/**
 * Emlog → 快照。
 *
 * 文章（emlog_blog）按文章导入；emlog_link 是友情链接表，按网址导入。
 * Emlog 的标签关系存在 emlog_tag.gid 里（逗号分隔的文章 ID），
 * 文章自身的 tags 字段再补一份名称。
 */

const LINK_CATEGORY_ID = -1;

export function buildEmlogSnapshot(
  tables: TableMap,
  prefix: string,
  opts: { sourceLabel?: string } = {}
): ImportSnapshot {
  const blogRows = tableRows(tables, `${prefix}blog`);
  const sortRows = tableRows(tables, `${prefix}sort`);
  const tagRows = tableRows(tables, `${prefix}tag`);
  const linkRows = tableRows(tables, `${prefix}link`);
  const optionRows = tableRows(tables, `${prefix}options`);

  const sourceSiteUrl = siteBase(
    optionValue(optionRows, ["blogurl", "siteurl", "site_url", "homeurl"])
  );

  const catCount = new Map<number, number>();
  for (const r of blogRows) {
    const sid = pickNum(r, "sortid");
    if (sid > 0) catCount.set(sid, (catCount.get(sid) ?? 0) + 1);
  }

  const categories: ImportCategory[] = [];
  for (const r of sortRows) {
    const id = pickNum(r, "sid", "id");
    if (!id) continue;
    categories.push({
      sourceId: id,
      parentSourceId: pickNum(r, "pid", "parent_id"),
      name: pick(r, "sortname", "name") || `分类 ${id}`,
      slug: pick(r, "alias", "slug"),
      description: stripTags(pick(r, "description", "intro")),
      icon: absoluteAssetUrl(pick(r, "sortimg", "icon", "image"), sourceSiteUrl),
      count: catCount.get(id) ?? 0,
    });
  }

  const tagsByContent = new Map<number, string[]>();
  for (const r of tagRows) {
    const name = pick(r, "tagname", "name");
    if (!name) continue;
    for (const gid of idList(pick(r, "gid"))) {
      if (!tagsByContent.has(gid)) tagsByContent.set(gid, []);
      tagsByContent.get(gid)!.push(name);
    }
  }

  const contents: ImportContent[] = [];
  for (const r of blogRows) {
    const id = pickNum(r, "gid", "id");
    if (!id) continue;
    const rawType = pick(r, "type").toLowerCase();
    if (rawType && rawType !== "blog" && rawType !== "page") continue;

    const hide = pickFlag(r, "hide");
    const checked = pick(r, "checked").toLowerCase();
    const status = hide ? "draft" : checked === "n" ? "pending" : "publish";

    const text = pick(r, "content");
    const sortId = pickNum(r, "sortid");
    const explicitTags = pick(r, "tags")
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const tags = [...new Set([...(tagsByContent.get(id) ?? []), ...explicitTags])];

    contents.push({
      sourceId: id,
      type: "article",
      title: pick(r, "title") || stripTags(text).slice(0, 80) || `内容 ${id}`,
      url: cleanExternalUrl(pick(r, "link")),
      description:
        stripTags(pick(r, "excerpt")) || stripTags(text).slice(0, 900),
      contentMd: rewriteRelativeAssets(text, sourceSiteUrl),
      icon: "",
      cover: absoluteAssetUrl(pick(r, "cover"), sourceSiteUrl),
      categorySourceId: sortId > 0 ? sortId : 0,
      categorySourceIds: sortId > 0 ? [sortId] : [],
      tags,
      views: pickNum(r, "views"),
      likes: pickNum(r, "like_count", "likes"),
      sticky: pickFlag(r, "top") ? 1 : 0,
      sortOrder: 0,
      status,
      createdAt: toDate(pick(r, "date", "create_time")),
      updatedAt: toDate(pick(r, "update_time", "date")),
      downloads: [],
      links: [],
    });
  }

  /* ------------------------------------------------------------ 友情链接 */
  const visibleLinks = linkRows.filter((r) => !pickFlag(r, "hide"));
  if (visibleLinks.length > 0) {
    categories.push({
      sourceId: LINK_CATEGORY_ID,
      parentSourceId: 0,
      name: "链接",
      slug: "links",
      description: "从 Emlog 链接表导入",
      icon: "",
      count: visibleLinks.length,
    });

    visibleLinks.forEach((r, index) => {
      const url = cleanExternalUrl(pick(r, "siteurl", "url", "link"));
      if (!url) return;
      const id = pickNum(r, "id", "lid") || index + 1;
      contents.push({
        sourceId: LINK_SOURCE_OFFSET + id,
        type: "site",
        title: pick(r, "sitename", "name", "title") || url,
        url,
        description: pick(r, "description", "desc", "intro"),
        contentMd: "",
        icon: absoluteAssetUrl(pick(r, "icon", "logo", "image"), sourceSiteUrl),
        cover: "",
        categorySourceId: LINK_CATEGORY_ID,
        categorySourceIds: [LINK_CATEGORY_ID],
        tags: [],
        views: 0,
        likes: 0,
        sticky: 0,
        sortOrder: pickNum(r, "taxis", "sort", "order"),
        status: "publish",
        createdAt: "",
        updatedAt: "",
        downloads: [],
        links: [],
      });
    });
  }

  return {
    sourceSystem: "emlog",
    sourceLabel: opts.sourceLabel ?? "",
    sourceSiteUrl,
    categories,
    contents,
    taxonomies: [
      { name: "category", count: categories.length - (visibleLinks.length > 0 ? 1 : 0) },
      { name: "tag", count: tagRows.length },
    ],
  };
}
