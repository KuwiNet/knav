import { mirrorNameFromUrl } from "./common";
import { optionValue, pick, pickNum, siteBase, tableRows, toDate, type TableMap } from "./tables";
import type {
  ImportCategory,
  ImportContent,
  ImportContentType,
  ImportDownload,
  ImportMirror,
  ImportSnapshot,
} from "./types";

/**
 * knav 自有数据库 → 快照。
 *
 * 除了保留多分类、标签、备用链接和下载三层结构，图标 / 封面 / 正文里的
 * `/uploads/...` 保持相对路径——用户通常会把上传素材包一起复制到新站。
 */
export function buildKnavSnapshot(
  tables: TableMap,
  prefix: string,
  opts: { sourceLabel?: string } = {}
): ImportSnapshot {
  const catRows = tableRows(tables, `${prefix}categories`);
  const contentRows = tableRows(tables, `${prefix}contents`);
  const contentCatRows = tableRows(tables, `${prefix}content_categories`);
  const tagRows = tableRows(tables, `${prefix}tags`);
  const contentTagRows = tableRows(tables, `${prefix}content_tags`);
  const linkRows = tableRows(tables, `${prefix}content_links`);
  const downloadRows = tableRows(tables, `${prefix}downloads`);
  const mirrorRows = tableRows(tables, `${prefix}download_mirrors`);
  const settingRows = tableRows(tables, `${prefix}settings`);

  const sourceSiteUrl = siteBase(optionValue(settingRows, ["site_url"]));

  const categories: ImportCategory[] = [];
  const catIds = new Set<number>();
  for (const r of catRows) {
    const id = pickNum(r, "id");
    if (!id) continue;
    catIds.add(id);
    categories.push({
      sourceId: id,
      parentSourceId: pickNum(r, "parent_id"),
      name: pick(r, "name") || `分类 ${id}`,
      slug: pick(r, "slug"),
      description: pick(r, "description"),
      icon: pick(r, "icon"),
      count: pickNum(r, "content_count"),
    });
  }

  const catsByContent = new Map<number, number[]>();
  for (const r of contentCatRows) {
    const cid = pickNum(r, "content_id");
    const cate = pickNum(r, "category_id");
    if (!cid || !cate) continue;
    if (!catsByContent.has(cid)) catsByContent.set(cid, []);
    catsByContent.get(cid)!.push(cate);
  }

  const tagName = new Map<number, string>();
  for (const r of tagRows) {
    const id = pickNum(r, "id");
    if (id) tagName.set(id, pick(r, "name") || `标签 ${id}`);
  }
  const tagsByContent = new Map<number, string[]>();
  for (const r of contentTagRows) {
    const cid = pickNum(r, "content_id");
    const tid = pickNum(r, "tag_id");
    const name = tagName.get(tid);
    if (!cid || !name) continue;
    if (!tagsByContent.has(cid)) tagsByContent.set(cid, []);
    tagsByContent.get(cid)!.push(name);
  }

  const linksByContent = new Map<number, ImportContent["links"]>();
  for (const r of linkRows) {
    const cid = pickNum(r, "content_id");
    const url = pick(r, "url");
    if (!cid || !url) continue;
    if (!linksByContent.has(cid)) linksByContent.set(cid, []);
    linksByContent.get(cid)!.push({
      name: pick(r, "name") || mirrorNameFromUrl(url),
      url,
      note: pick(r, "note"),
    });
  }

  const mirrorsByDownload = new Map<number, ImportMirror[]>();
  for (const r of mirrorRows) {
    const did = pickNum(r, "download_id");
    const url = pick(r, "url");
    if (!did || !url) continue;
    if (pick(r, "enabled") === "0") continue;
    if (!mirrorsByDownload.has(did)) mirrorsByDownload.set(did, []);
    mirrorsByDownload.get(did)!.push({
      name: pick(r, "name") || mirrorNameFromUrl(url),
      url,
      fileSize: pick(r, "file_size"),
      note: pick(r, "note"),
    });
  }

  const downloadsByContent = new Map<number, ImportDownload[]>();
  for (const r of downloadRows) {
    const cid = pickNum(r, "content_id");
    if (!cid) continue;
    if (pick(r, "enabled") === "0") continue;
    const id = pickNum(r, "id");
    const list = downloadsByContent.get(cid) ?? [];
    list.push({
      platform: pick(r, "platform"),
      arch: pick(r, "arch"),
      version: pick(r, "version"),
      fileSize: pick(r, "file_size"),
      note: pick(r, "note"),
      mirrors: mirrorsByDownload.get(id) ?? [],
    });
    downloadsByContent.set(cid, list);
  }

  const contents: ImportContent[] = [];
  for (const r of contentRows) {
    const id = pickNum(r, "id");
    if (!id) continue;
    const type = pick(r, "type") as ImportContentType;
    if (type !== "site" && type !== "article" && type !== "app") continue;

    const joins = (catsByContent.get(id) ?? []).filter((cid) => catIds.has(cid));
    const primary = pickNum(r, "category_id");
    const allCats = [...new Set([primary, ...joins].filter((cid) => cid > 0))];

    contents.push({
      sourceId: id,
      type,
      title: pick(r, "title") || `内容 ${id}`,
      url: pick(r, "url"),
      description: pick(r, "description"),
      contentMd: pick(r, "content_md"),
      icon: pick(r, "icon"),
      cover: pick(r, "cover"),
      categorySourceId: primary > 0 ? primary : allCats[0] ?? 0,
      categorySourceIds: allCats,
      tags: tagsByContent.get(id) ?? [],
      views: pickNum(r, "views"),
      likes: pickNum(r, "likes"),
      sticky: pickNum(r, "sticky") ? 1 : 0,
      sortOrder: pickNum(r, "sort_order"),
      status: pick(r, "status") || "publish",
      createdAt: toDate(pick(r, "created_at")),
      updatedAt: toDate(pick(r, "updated_at")),
      downloads: downloadsByContent.get(id) ?? [],
      links: linksByContent.get(id) ?? [],
    });
  }

  return {
    sourceSystem: "knav",
    sourceLabel: opts.sourceLabel ?? "",
    sourceSiteUrl,
    categories,
    contents,
    taxonomies: [{ name: "category", count: categories.length }],
  };
}
