import { query, queryOne, transaction } from "../db";
import { refreshCategoryCounts, refreshTagCounts } from "../counters";
import { backfillContentCategories } from "../content-categories";
import { slugify } from "./common";
import type {
  ImportCategory,
  ImportContent,
  ImportSelection,
  ImportSnapshot,
  ImportStats,
} from "./types";

/**
 * 把快照里勾选的内容写进 knav 表。
 *
 * 写入策略：
 *   - 分类：保留父子结构；勾选子分类时自动带上它的父分类
 *   - 内容：用 (source, source_id) 去重，重复导入同一来源不会产生两份
 *   - 标签：按名称复用已有标签
 *   - 软件：平台版本 → 镜像链接两层都写全
 */

const SOURCE_TAG = "import";

/**
 * 源站的字段可能比本站列宽大（OneNav 常把图标存成 data:URI）。
 * 文本按列宽截断；地址类太长直接丢掉——半截 URL 比没图标更难用。
 */
function clip(v: string | null | undefined, max: number): string {
  const s = v == null ? "" : String(v);
  return s.length > max ? s.slice(0, max) : s;
}

function clipUrl(v: string | null | undefined, max: number): string {
  const s = v == null ? "" : String(v);
  return s.length > max ? "" : s;
}

/** 执行导入 */
export async function runImport(
  snapshot: ImportSnapshot,
  selection: ImportSelection,
  sourceLabel: string
): Promise<ImportStats> {
  const stats: ImportStats = {
    categories: 0,
    contents: 0,
    sites: 0,
    articles: 0,
    apps: 0,
    downloads: 0,
    mirrors: 0,
    tags: 0,
    links: 0,
    skipped: 0,
  };

  // 勾选的分类 + 其所有祖先
  const selectedCats = expandWithAncestors(snapshot.categories, selection.categoryIds);
  const catIdMap = new Map<number, number>();

  await transaction(async (conn) => {
    // 分类按层级写入，父分类先建
    const ordered = sortByDepth(selectedCats);
    // 已存在的 slug 也算占用，避免和库里已有的分类撞唯一键
    const usedSlugs = new Set<string>(
      (await query<{ slug: string }>("SELECT slug FROM knav_categories")).map(
        (r) => r.slug
      )
    );

    for (const cat of ordered) {
      const parentId = cat.parentSourceId
        ? catIdMap.get(cat.parentSourceId) ?? 0
        : 0;

      let slug = slugify(cat.slug || cat.name) || `cat-${cat.sourceId}`;
      slug = uniqueSlug(clip(slug, 120), usedSlugs);

      const [ins] = await conn.query(
        `INSERT INTO knav_categories
           (parent_id, name, slug, description, icon, cover, color, sort_order)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          parentId,
          clip(cat.name, 100),
          slug,
          clip(cat.description, 500),
          selection.options.categoryIcons ? clipUrl(cat.icon, 1024) : "",
          "",
          "",
          0,
        ]
      );
      catIdMap.set(cat.sourceId, (ins as any).insertId);
      stats.categories++;
    }

    // 已有同源内容：跳过
    const selectedContents = snapshot.contents.filter((c) =>
      selection.contentIds.includes(c.sourceId)
    );
    const ids = selectedContents.map((c) => c.sourceId);
    const existing = new Set<number>();
    if (ids.length > 0) {
      const rows = await query<{ source_id: number }>(
        `SELECT source_id FROM knav_contents
          WHERE source = ? AND source_id IN (${ids.map(() => "?").join(",")})`,
        [SOURCE_TAG, ...ids]
      );
      for (const r of rows) existing.add(Number(r.source_id));
    }

    const usedContentSlugs = new Set<string>();
    const tagIdCache = new Map<string, number>();

    for (const c of selectedContents) {
      if (existing.has(c.sourceId)) {
        stats.skipped++;
        continue;
      }
      const status = mapStatus(c.status, selection.options.publishAll);
      if (!status) {
        stats.skipped++;
        continue;
      }

      const categoryId = c.categorySourceId ? catIdMap.get(c.categorySourceId) ?? 0 : 0;
      const slug = uniqueSlug(
        clip(slugify(c.title || `content-${c.sourceId}`) || `content-${c.sourceId}`, 200),
        usedContentSlugs
      );

      const [ins] = await conn.query(
        `INSERT INTO knav_contents
           (type, title, slug, url, description, content_md, icon, cover, category_id,
            views, likes, sticky, sort_order, status, source, source_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          c.type,
          clip(c.title, 200),
          slug,
          clipUrl(c.url, 500),
          clip(c.description, 1000),
          c.contentMd,
          clipUrl(c.icon, 1024),
          clipUrl(c.cover, 500),
          categoryId,
          selection.options.counters ? c.views : 0,
          selection.options.counters ? c.likes : 0,
          c.sticky,
          c.sortOrder,
          status,
          SOURCE_TAG,
          c.sourceId,
          toSqlDate(c.createdAt),
          toSqlDate(c.updatedAt),
        ]
      );
      const contentId = (ins as any).insertId;
      stats.contents++;
      if (c.type === "site") stats.sites++;
      else if (c.type === "article") stats.articles++;
      else stats.apps++;

      // 标签
      if (selection.options.tags && c.tags.length > 0) {
        for (const raw of c.tags) {
          const name = raw.trim();
          if (!name) continue;
          const tagId = await ensureTag(conn, tagIdCache, name);
          await conn.query(
            `INSERT IGNORE INTO knav_content_tags (content_id, tag_id) VALUES (?,?)`,
            [contentId, tagId]
          );
          stats.tags++;
        }
      }

      // 备用链接
      for (const l of c.links) {
        await conn.query(
          `INSERT INTO knav_content_links (content_id, name, url, note, sort_order) VALUES (?,?,?,?,?)`,
          [contentId, clip(l.name, 100), clipUrl(l.url, 500), clip(l.note, 200), 0]
        );
        stats.links++;
      }

      // 软件的平台版本与镜像
      if (selection.options.downloads && c.downloads.length > 0) {
        let sort = 0;
        for (const d of c.downloads) {
          const [dIns] = await conn.query(
            `INSERT INTO knav_downloads
               (content_id, resource_title, platform, arch, version, file_size, note, enabled, sort_order)
             VALUES (?,?,?,?,?,?,?,1,?)`,
            [
              contentId,
              clip(c.title, 200),
              clip(d.platform, 60),
              clip(d.arch, 40),
              clip(d.version, 60),
              clip(d.fileSize, 40),
              clip(d.note, 500),
              sort++,
            ]
          );
          const downloadId = (dIns as any).insertId;
          stats.downloads++;

          let mSort = 0;
          for (const m of d.mirrors) {
            await conn.query(
              `INSERT INTO knav_download_mirrors
                 (download_id, name, url, file_size, note, enabled, sort_order)
               VALUES (?,?,?,?,?,1,?)`,
              [
                downloadId,
                clip(m.name, 100),
                clipUrl(m.url, 500),
                clip(m.fileSize || d.fileSize, 40),
                clip(m.note, 200),
                mSort++,
              ]
            );
            stats.mirrors++;
          }
        }
      }
    }
  });

  await backfillContentCategories();
  await refreshCategoryCounts();
  await refreshTagCounts();

  return stats;
}

/** 勾选的分类 + 其所有祖先（父分类必须一起导，否则子分类会变孤儿） */
function expandWithAncestors(
  categories: ImportCategory[],
  selected: number[]
): ImportCategory[] {
  const byId = new Map(categories.map((c) => [c.sourceId, c]));
  const keep = new Set<number>();
  for (const id of selected) {
    let cur = byId.get(id);
    while (cur && !keep.has(cur.sourceId)) {
      keep.add(cur.sourceId);
      cur = cur.parentSourceId ? byId.get(cur.parentSourceId) : undefined;
    }
  }
  return categories.filter((c) => keep.has(c.sourceId));
}

/** 父分类在前 */
function sortByDepth(cats: ImportCategory[]): ImportCategory[] {
  const byId = new Map(cats.map((c) => [c.sourceId, c]));
  const depth = (c: ImportCategory): number => {
    let d = 0;
    let cur = c.parentSourceId ? byId.get(c.parentSourceId) : undefined;
    const seen = new Set<number>();
    while (cur && !seen.has(cur.sourceId)) {
      seen.add(cur.sourceId);
      d++;
      cur = cur.parentSourceId ? byId.get(cur.parentSourceId) : undefined;
    }
    return d;
  };
  return [...cats].sort((a, b) => depth(a) - depth(b) || a.sourceId - b.sourceId);
}

/** slug 去重（knav_categories.slug 是唯一键） */
function uniqueSlug(base: string, used: Set<string>): string {
  let s = base || "item";
  let i = 2;
  while (used.has(s)) s = `${base}-${i++}`;
  used.add(s);
  return s;
}

/** 来源状态 → knav 状态；返回空串表示不导入 */
function mapStatus(status: string, publishAll: boolean): string {
  if (publishAll) return "publish";
  switch (status) {
    case "publish":
    case "future":
      return "publish";
    case "draft":
    case "pending":
      return "draft";
    default:
      return "";
  }
}

/** 标签按名称复用 */
async function ensureTag(
  conn: any,
  cache: Map<string, number>,
  name: string
): Promise<number> {
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const slug = uniqueSlug(clip(slugify(name) || `tag-${cache.size}`, 120), new Set());
  const name100 = clip(name, 100);
  const [rows] = await conn.query(
    `SELECT id FROM knav_tags WHERE name = ? OR slug = ? LIMIT 1`,
    [name100, slug]
  );
  if ((rows as any[]).length > 0) {
    const id = Number((rows as any[])[0].id);
    cache.set(key, id);
    return id;
  }
  const [ins] = await conn.query(`INSERT INTO knav_tags (name, slug) VALUES (?,?)`, [
    name100,
    slug,
  ]);
  const id = Number((ins as any).insertId);
  cache.set(key, id);
  return id;
}

/** 各种日期写法统一成 MySQL 能收的格式 */
function toSqlDate(raw: string): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t} 00:00:00`;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** 取某个来源下已导入的内容数（用于提示） */
export async function countImported(sourceLabel: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM knav_contents WHERE source = ?`,
    [SOURCE_TAG]
  );
  void sourceLabel;
  return Number(row?.n) || 0;
}
