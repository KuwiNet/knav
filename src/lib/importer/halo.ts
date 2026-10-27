import { absoluteAssetUrl, rewriteRelativeAssets, stripTags } from "./common";
import {
  cleanExternalUrl,
  LINK_SOURCE_OFFSET,
  optionValue,
  pick,
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
 * Halo 1.x → 快照。
 *
 * 文章在 posts，正文在 contents（Halo 1.4 起拆出去，一个 post 可能有多条历史版本，
 * 取 id 最大的那条）。状态是数字：0 已发布 / 1 草稿 / 2 回收站 / 3 私密。
 * links 表按网址导入，并附带「链接」分类。
 */

const LINK_CATEGORY_ID = -1;

export function buildHaloSnapshot(
  tables: TableMap,
  opts: { sourceLabel?: string } = {}
): ImportSnapshot {
  const postRows = tableRows(tables, "posts");
  const contentRows = tableRows(tables, "contents");
  const catRows = tableRows(tables, "categories");
  const tagRows = tableRows(tables, "tags");
  const postCatRows = tableRows(tables, "post_categories");
  const postTagRows = tableRows(tables, "post_tags");
  const linkRows = tableRows(tables, "links");
  const optionRows = tableRows(tables, "options");

  const sourceSiteUrl = siteBase(
    optionValue(optionRows, ["blog_url", "site_url", "home_url", "siteurl", "blogurl"])
  );

  const latestContent = new Map<number, { id: number; row: Record<string, any> }>();
  for (const r of contentRows) {
    const postId = pickNum(r, "post_id");
    const id = pickNum(r, "id");
    if (!postId) continue;
    const hit = latestContent.get(postId);
    if (!hit || id > hit.id) latestContent.set(postId, { id, row: r });
  }

  const catCount = new Map<number, number>();
  const catsByPost = new Map<number, number[]>();
  for (const r of postCatRows) {
    const postId = pickNum(r, "post_id");
    const catId = pickNum(r, "category_id");
    if (!postId || !catId) continue;
    catCount.set(catId, (catCount.get(catId) ?? 0) + 1);
    if (!catsByPost.has(postId)) catsByPost.set(postId, []);
    catsByPost.get(postId)!.push(catId);
  }

  const tagsByPost = new Map<number, string[]>();
  const tagName = new Map<number, string>();
  for (const r of tagRows) {
    const id = pickNum(r, "id");
    const name = pick(r, "name");
    if (id && name) tagName.set(id, name);
  }
  for (const r of postTagRows) {
    const postId = pickNum(r, "post_id");
    const tagId = pickNum(r, "tag_id");
    const name = tagName.get(tagId);
    if (!postId || !name) continue;
    if (!tagsByPost.has(postId)) tagsByPost.set(postId, []);
    tagsByPost.get(postId)!.push(name);
  }

  const categories: ImportCategory[] = [];
  for (const r of catRows) {
    const id = pickNum(r, "id");
    if (!id) continue;
    categories.push({
      sourceId: id,
      parentSourceId: pickNum(r, "parent_id"),
      name: pick(r, "name") || `分类 ${id}`,
      slug: pick(r, "slug"),
      description: stripTags(pick(r, "description")),
      icon: absoluteAssetUrl(pick(r, "thumbnail"), sourceSiteUrl),
      count: catCount.get(id) ?? 0,
    });
  }

  const contents: ImportContent[] = [];
  for (const r of postRows) {
    const id = pickNum(r, "id");
    if (!id) continue;

    const rawType = pick(r, "type");
    if (rawType && rawType !== "0" && rawType !== "1") continue;

    const statusRaw = pick(r, "status");
    const status = haloStatus(statusRaw);
    if (!status) continue;

    const contentRow = latestContent.get(id)?.row;
    const original = contentRow
      ? pick(contentRow, "original_content") || pick(contentRow, "content")
      : pick(r, "original_content") || pick(r, "format_content");

    const summary = pick(r, "summary", "meta_description");
    const title = pick(r, "title") || stripTags(original).slice(0, 80) || `内容 ${id}`;

    contents.push({
      sourceId: id,
      type: "article",
      title,
      url: cleanExternalUrl(pick(r, "url")),
      description: stripTags(summary).slice(0, 900),
      contentMd: rewriteRelativeAssets(original, sourceSiteUrl),
      icon: absoluteAssetUrl(pick(r, "thumbnail"), sourceSiteUrl),
      cover: absoluteAssetUrl(pick(r, "thumbnail"), sourceSiteUrl),
      categorySourceId: catsByPost.get(id)?.[0] ?? 0,
      categorySourceIds: catsByPost.get(id) ?? [],
      tags: tagsByPost.get(id) ?? [],
      views: pickNum(r, "visits", "views"),
      likes: pickNum(r, "likes"),
      sticky: pickNum(r, "top_priority") > 0 ? 1 : 0,
      sortOrder: pickNum(r, "top_priority"),
      status,
      createdAt: toDate(pick(r, "create_time")),
      updatedAt: toDate(pick(r, "update_time") || pick(r, "edit_time")),
      downloads: [],
      links: [],
    });
  }

  /* ------------------------------------------------------------ 友情链接 */
  if (linkRows.length > 0) {
    categories.push({
      sourceId: LINK_CATEGORY_ID,
      parentSourceId: 0,
      name: "链接",
      slug: "links",
      description: "从 Halo 链接表导入",
      icon: "",
      count: linkRows.length,
    });

    linkRows.forEach((r, index) => {
      const url = cleanExternalUrl(pick(r, "url"));
      if (!url) return;
      const id = pickNum(r, "id") || index + 1;
      contents.push({
        sourceId: LINK_SOURCE_OFFSET + id,
        type: "site",
        title: pick(r, "name", "title") || url,
        url,
        description: stripTags(pick(r, "description", "team")),
        contentMd: "",
        icon: absoluteAssetUrl(pick(r, "logo", "icon", "thumbnail"), sourceSiteUrl),
        cover: "",
        categorySourceId: LINK_CATEGORY_ID,
        categorySourceIds: [LINK_CATEGORY_ID],
        tags: [],
        views: 0,
        likes: 0,
        sticky: 0,
        sortOrder: pickNum(r, "priority"),
        status: "publish",
        createdAt: toDate(pick(r, "create_time")),
        updatedAt: toDate(pick(r, "update_time")),
        downloads: [],
        links: [],
      });
    });
  }

  return {
    sourceSystem: "halo",
    sourceLabel: opts.sourceLabel ?? "",
    sourceSiteUrl,
    categories,
    contents,
    taxonomies: [
      { name: "category", count: categories.length - (linkRows.length > 0 ? 1 : 0) },
      { name: "tag", count: tagRows.length },
    ],
  };
}

function haloStatus(raw: string): string {
  switch (raw) {
    case "0":
      return "publish";
    case "1":
      return "draft";
    case "2":
      return ""; // 回收站
    case "3":
      return ""; // 私密文章
    default:
      return raw ? "draft" : "publish";
  }
}
