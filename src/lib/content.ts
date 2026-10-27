import { query, queryOne } from "./db";
import { resolveAssetHref } from "./asset-url";
import { excerptFromMarkdown, excerptFromContent, firstImageFromContent } from "./markdown";

/**
 * 内容仓储层：读取 knav 自己的表。
 *
 * knav 有自己的表结构，不再直接读 WordPress：
 *   knav_contents   网址收藏 / 文章 / 软件统一一张表，用 type 区分
 *   knav_categories 分类树（parent_id 指向顶级分类，0 为顶级）
 *   knav_tags       标签，与内容通过 knav_content_tags 关联
 *   knav_downloads  软件平台版本，下面挂 knav_download_mirrors 镜像链接
 *
 * 老站（WordPress / OneNav 等）的数据由「数据迁移」页导入，
 * 导入后与这里创建的内容完全同构，前台读法只有一套。
 */

export type ContentType = "site" | "article" | "app";

export interface ContentItem {
  id: number;
  type: ContentType;
  title: string;
  /** 网址类型的跳转地址；文章/应用为空 */
  url: string;
  /** 简介/摘要 */
  description: string;
  /** 图标或封面图 URL */
  image: string;
  /** 所属分类 */
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  /** 标签列表 */
  tags: { id: number; name: string; slug: string }[];
  date: string;
  modified: string;
  views: number;
  likes: number;
  /** Markdown 原文（文章） */
  contentMd?: string;
  /** 下载项（app） */
  downloads?: DownloadItem[];
  /** 备用地址（网址） */
  spareLinks?: SpareLink[];
  /** 自定义图标（后台可配），为空时用 image */
  icon?: string;
  /** 封面图（文章无图标时用作缩略图） */
  cover?: string;
  /** 是否置顶 */
  sticky?: number;
  /** 排序权重 */
  order?: number;
  /** 跳转用的规范路径 */
  path: string;
}

export interface DownloadItem {
  id: number;
  name: string;
  version: string;
  platform: string;
  /** 架构：x64 / ARM64 / Apple Silicon …，空串表示该平台不区分架构 */
  arch: string;
  url: string;
  fileSize: string;
  language: string;
  date: string;
  isLatest: boolean;
  /** 版本说明（后台维护的平台版本上填的） */
  note?: string;
  /** 一个版本可能有多个下载按钮（官网 / 网盘 / 镜像） */
  buttons?: { name: string; url: string; info: string }[];
}

export interface SpareLink {
  name: string;
  url: string;
  note: string;
}

/** 各类型内容对应的 URL 前缀 */
const TYPE_PATH: Record<ContentType, string> = {
  site: "/sites",
  article: "",
  app: "/app",
};

function typeOf(t: string): ContentType {
  if (t === "app") return "app";
  if (t === "site") return "site";
  return "article";
}

function pathOf(type: ContentType, id: number): string {
  const prefix = TYPE_PATH[type];
  return prefix ? `${prefix}/${id}.html` : `/${id}.html`;
}

/**
 * 读取一批内容的完整信息。
 * 分类、标签、备用链接分几次批量取，避免 N+1 查询。
 */
export async function getContentItems(
  opts: {
    ids?: number[];
    type?: ContentType;
    categoryId?: number;
    tagSlug?: string;
    limit?: number;
    offset?: number;
    orderBy?: "date" | "modified" | "views" | "rand";
    keyword?: string;
    status?: string;
  } = {}
): Promise<ContentItem[]> {
  const {
    ids,
    type,
    categoryId,
    tagSlug,
    limit = 50,
    offset = 0,
    orderBy = "date",
    keyword,
    status = "publish",
  } = opts;

  const params: any[] = [];
  const where: string[] = [`c.status = ?`];
  params.push(status);

  if (ids && ids.length > 0) {
    where.push(`c.id IN (${ids.map(() => "?").join(",")})`);
    params.push(...ids);
  }
  if (type) {
    where.push("c.type = ?");
    params.push(type);
  }
  if (categoryId) {
    // 分类含子分类：父分类页可以看到子分类下的内容
    const subIds = await expandCategoryIds(categoryId);
    if (subIds.length === 0) return [];
    const marks = subIds.map(() => "?").join(",");
    where.push(
      `(c.category_id IN (${marks}) OR c.id IN (
         SELECT cc.content_id FROM knav_content_categories cc
         WHERE cc.category_id IN (${marks})
       ))`
    );
    params.push(...subIds, ...subIds);
  }
  if (tagSlug) {
    where.push(
      `EXISTS (SELECT 1 FROM knav_content_tags ct
               JOIN knav_tags t ON t.id = ct.tag_id
               WHERE ct.content_id = c.id AND t.slug = ?)`
    );
    params.push(tagSlug);
  }
  if (keyword) {
    where.push("(c.title LIKE ? OR c.description LIKE ? OR c.content_md LIKE ?)");
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }

  const orderMap: Record<string, string> = {
    date: "c.created_at DESC",
    modified: "c.updated_at DESC",
    rand: "RAND()",
    views: "c.views DESC, c.created_at DESC",
  };
  const orderSql = orderMap[orderBy] ?? orderMap.date;

  const rows = await query<any>(
    `SELECT c.id, c.type, c.title, c.url, c.description, c.content_md, c.icon, c.cover,
            c.category_id, c.views, c.likes, c.sticky, c.sort_order,
            c.created_at, c.updated_at,
            cat.name AS category_name, cat.slug AS category_slug
     FROM knav_contents c
     LEFT JOIN knav_categories cat ON cat.id = c.category_id
     WHERE ${where.join(" AND ")}
     ORDER BY c.sticky DESC, c.sort_order ASC, ${orderSql}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  if (rows.length === 0) return [];

  const contentIds = rows.map((r) => Number(r.id));
  const [tagMap, linkMap] = await Promise.all([
    loadTagsOf(contentIds),
    loadSpareLinksOf(contentIds),
  ]);

  return rows.map((r) => {
    const t = typeOf(r.type);
    const fallbackImage = t === "article" ? firstImageFromContent(r.content_md ?? "") : "";
    const thumbRaw = r.icon || r.cover || fallbackImage;

    return {
      id: Number(r.id),
      type: t,
      title: r.title ?? "",
      url: r.url ?? "",
      description: r.description ?? "",
      // 前台展示统一按当前访问域名取图：生产「站点地址」可能是别的域名/端口，
      // 用它拼绝对地址会让刚本地化的 /uploads 图标 404（后台预览是相对路径，所以看着正常）
      image: resolveAssetHref(thumbRaw),
      categoryId: Number(r.category_id) || 0,
      categoryName: r.category_name ?? "",
      categorySlug: r.category_slug ?? "",
      tags: tagMap.get(Number(r.id)) ?? [],
      date: r.created_at ?? "",
      modified: r.updated_at ?? "",
      views: Number(r.views) || 0,
      likes: Number(r.likes) || 0,
      contentMd: t === "article" ? r.content_md ?? "" : undefined,
      downloads: undefined,
      spareLinks: linkMap.get(Number(r.id)),
      icon: resolveAssetHref(r.icon),
      cover: resolveAssetHref(r.cover),
      sticky: Number(r.sticky) || 0,
      order: Number(r.sort_order) || 0,
      path: pathOf(t, Number(r.id)),
    };
  });
}

/** 读取单个内容详情（含正文） */
export async function getContentItem(id: number): Promise<ContentItem | null> {
  const items = await getContentItems({ ids: [id], limit: 1 });
  return items[0] ?? null;
}

/** 批量加载标签 */
async function loadTagsOf(
  contentIds: number[]
): Promise<Map<number, { id: number; name: string; slug: string }[]>> {
  const map = new Map<number, { id: number; name: string; slug: string }[]>();
  if (contentIds.length === 0) return map;
  const placeholders = contentIds.map(() => "?").join(",");
  const rows = await query<any>(
    `SELECT ct.content_id, t.id, t.name, t.slug
     FROM knav_content_tags ct
     JOIN knav_tags t ON t.id = ct.tag_id
     WHERE ct.content_id IN (${placeholders})
     ORDER BY t.id ASC`,
    contentIds
  );
  for (const r of rows) {
    const list = map.get(Number(r.content_id)) ?? [];
    list.push({ id: Number(r.id), name: r.name ?? "", slug: r.slug ?? "" });
    map.set(Number(r.content_id), list);
  }
  return map;
}

/** 批量加载备用链接 */
async function loadSpareLinksOf(
  contentIds: number[]
): Promise<Map<number, SpareLink[]>> {
  const map = new Map<number, SpareLink[]>();
  if (contentIds.length === 0) return map;
  const placeholders = contentIds.map(() => "?").join(",");
  const rows = await query<any>(
    `SELECT content_id, name, url, note
     FROM knav_content_links
     WHERE content_id IN (${placeholders})
     ORDER BY sort_order ASC, id ASC`,
    contentIds
  );
  for (const r of rows) {
    const list = map.get(Number(r.content_id)) ?? [];
    list.push({ name: r.name ?? "", url: r.url ?? "", note: r.note ?? "" });
    map.set(Number(r.content_id), list);
  }
  return map;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
  parent: number;
  /** 该分类下三种内容的数量统计 */
  siteCount: number;
  articleCount: number;
  appCount: number;
  /** 图标：内置 SVG 名 / iconfont 类名 / 图片地址 */
  icon: string;
  /** 排序权重，越小越靠前 */
  order: number;
  /** 封面图 */
  cover: string;
  /** 主题色 */
  color: string;
}

/** 读取全部分类（含各类型内容数，子分类内容并入父分类） */
export async function getCategories(): Promise<Category[]> {
  const rows = await query<any>(
    `SELECT id, parent_id, name, slug, description, icon, cover, color, sort_order
     FROM knav_categories
     ORDER BY parent_id ASC, sort_order ASC, id ASC`
  );

  const countRows = await query<any>(
    `SELECT category_id,
            COUNT(DISTINCT CASE WHEN type = 'site'    THEN id END) AS siteCount,
            COUNT(DISTINCT CASE WHEN type = 'article' THEN id END) AS articleCount,
            COUNT(DISTINCT CASE WHEN type = 'app'     THEN id END) AS appCount
     FROM (
       SELECT category_id, type, id FROM knav_contents
        WHERE status = 'publish' AND category_id > 0
       UNION
       SELECT cc.category_id, c.type, c.id
         FROM knav_content_categories cc
         JOIN knav_contents c ON c.id = cc.content_id AND c.status = 'publish'
     ) x
     GROUP BY category_id`
  );

  const direct = new Map<number, { site: number; article: number; app: number }>();
  for (const r of countRows) {
    direct.set(Number(r.category_id), {
      site: Number(r.siteCount) || 0,
      article: Number(r.articleCount) || 0,
      app: Number(r.appCount) || 0,
    });
  }

  const childrenOf = new Map<number, number[]>();
  for (const r of rows) {
    const parent = Number(r.parent_id) || 0;
    if (!parent) continue;
    const list = childrenOf.get(parent) ?? [];
    list.push(Number(r.id));
    childrenOf.set(parent, list);
  }

  const rolled = new Map<number, { site: number; article: number; app: number }>();
  const rollup = (id: number): { site: number; article: number; app: number } => {
    const cached = rolled.get(id);
    if (cached) return cached;
    const acc = { ...(direct.get(id) ?? { site: 0, article: 0, app: 0 }) };
    rolled.set(id, acc);
    for (const child of childrenOf.get(id) ?? []) {
      const c = rollup(child);
      acc.site += c.site;
      acc.article += c.article;
      acc.app += c.app;
    }
    return acc;
  };

  const list = rows.map((r) => {
    const c = rollup(Number(r.id));
    return {
      id: Number(r.id),
      name: r.name ?? "",
      slug: r.slug ?? "",
      description: r.description ?? "",
      count: c.site + c.article + c.app,
      parent: Number(r.parent_id) || 0,
      siteCount: c.site,
      articleCount: c.article,
      appCount: c.app,
      icon: r.icon ?? "",
      order: Number(r.sort_order) || 0,
      cover: r.cover ?? "",
      color: r.color ?? "",
    };
  });

  return list.sort((a, b) => {
    if (a.parent !== b.parent) return a.parent - b.parent;
    if (a.order !== b.order) return a.order - b.order;
    return a.id - b.id;
  });
}

/** 分类树：顶级分类下挂二级分类，供"点顶级分类才展开"的界面使用 */
export interface CategoryNode {
  category: Category;
  children: Category[];
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
  const all = await getCategories();
  const childrenOf = new Map<number, Category[]>();
  for (const c of all) {
    if (!c.parent) continue;
    const list = childrenOf.get(c.parent) ?? [];
    list.push(c);
    childrenOf.set(c.parent, list);
  }
  return all
    .filter((c) => c.parent === 0)
    .map((c) => ({ category: c, children: childrenOf.get(c.id) ?? [] }));
}

/** 按 slug 查分类 */
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const row = await queryOne<any>(
    "SELECT id FROM knav_categories WHERE slug = ? LIMIT 1",
    [slug]
  );
  if (!row) return null;
  const cats = await getCategories();
  return cats.find((c) => c.id === Number(row.id)) ?? null;
}

/** 展开分类及其所有子分类的 id */
export async function expandCategoryIds(categoryId: number): Promise<number[]> {
  const rows = await query<{ id: number; parent_id: number }>(
    "SELECT id, parent_id FROM knav_categories"
  );
  const childrenOf = new Map<number, number[]>();
  for (const r of rows) {
    const parent = Number(r.parent_id) || 0;
    if (!parent) continue;
    const list = childrenOf.get(parent) ?? [];
    list.push(Number(r.id));
    childrenOf.set(parent, list);
  }
  const out: number[] = [];
  const walk = (id: number) => {
    out.push(id);
    for (const child of childrenOf.get(id) ?? []) walk(child);
  };
  walk(categoryId);
  return out;
}

/** 读取标签 */
export async function getTags(limit = 100): Promise<{ id: number; name: string; slug: string; count: number }[]> {
  const rows = await query<any>(
    `SELECT id, name, slug, count FROM knav_tags
     WHERE count > 0
     ORDER BY count DESC, id ASC
     LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name ?? "",
    slug: r.slug ?? "",
    count: Number(r.count) || 0,
  }));
}

/**
 * 读取 app 的下载数据。
 *
 * 结构是「平台版本 → 多个镜像链接」：同一个软件的 Windows / macOS / Android
 * 各占一行，每行下面可以挂官方下载、百度网盘、123网盘、App Store 等多个入口。
 */
export async function getDownloads(appId: number): Promise<DownloadItem[]> {
  const platforms = await query<any>(
    `SELECT id, platform, arch, version, file_size, note, count, updated_at
     FROM knav_downloads WHERE content_id = ? AND enabled = 1
     ORDER BY sort_order ASC, id ASC`,
    [appId]
  );

  if (platforms.length === 0) return [];

  const ids = platforms.map((p) => Number(p.id));
  const placeholders = ids.map(() => "?").join(",");
  const mirrorRows = await query<any>(
    `SELECT download_id, name, url, file_size, note
     FROM knav_download_mirrors
     WHERE download_id IN (${placeholders}) AND enabled = 1 AND url <> ''
     ORDER BY sort_order ASC, id ASC`,
    ids
  );
  const byDownload = new Map<number, { name: string; url: string; info: string }[]>();
  for (const m of mirrorRows) {
    const did = Number(m.download_id) || 0;
    const list = byDownload.get(did) ?? [];
    list.push({
      name: m.name || "下载",
      url: m.url,
      info: [m.file_size, m.note].filter(Boolean).join(" · "),
    });
    byDownload.set(did, list);
  }

  const items: DownloadItem[] = [];
  for (const r of platforms) {
    const buttons = byDownload.get(Number(r.id)) ?? [];
    // 一个镜像都没有的平台不展示，前台点了也没处去
    if (buttons.length === 0) continue;
    items.push({
      id: Number(r.id),
      name: r.platform || "通用",
      version: r.version ?? "",
      platform: r.platform ?? "",
      arch: r.arch ?? "",
      url: buttons[0]?.url ?? "",
      fileSize: r.file_size ?? "",
      language: "",
      date: String(r.updated_at ?? "").slice(0, 10),
      isLatest: false,
      note: r.note ?? "",
      buttons,
    });
  }
  // 第一条标为「最新」，与老站一致
  if (items.length > 0) items[0].isLatest = true;
  return items;
}

/**
 * 从路由参数解析内容 ID。
 * 前台沿用 OneNav 的 URL 风格：/{id}.html、/sites/{id}.html、/app/{id}.html，
 * 所以需要先去掉 .html 后缀再转数字。
 */
export function parseContentId(raw: string): number {
  const n = Number(String(raw ?? "").replace(/\.html?$/i, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 去除 HTML 标签取纯文本摘要 */
export function stripHtml(html: string): string {
  return (html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** 统计总浏览量 */
export async function getTotalViews(): Promise<number> {
  const row = await queryOne<{ total: number }>(
    "SELECT COALESCE(SUM(views), 0) AS total FROM knav_contents"
  );
  return Number(row?.total) || 0;
}

/** 摘要工具的对外出口（后台列表用） */
export { excerptFromMarkdown, excerptFromContent };
