// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  require("server-only");
}
import { query, queryOne, execute, transaction } from "./db";
import type { AdminContentDetail } from "./admin-types";
import { getSettingMap } from "./settings";
import { expandCategoryIds } from "./content";
import { pinyinInitials } from "./pinyin";

/**
 * 后台数据访问层。
 *
 * 分类、内容、下载这些数据都放在 knav 自己的表里，
 * 后台的操作直接作用在这些表上，从而与前台读取路径完全一致。
 */

/* ---------------------------------------------------------------- 统计 */

export interface AdminStats {
  sites: number;
  articles: number;
  apps: number;
  categories: number;
  tags: number;
  users: number;
  pendingUsers: number;
  pendingSubmissions: number;
  totalViews: number;
  todaySubmissions: number;
  /** 素材库文件数 */
  media: number;
  /** 素材库占用字节 */
  mediaBytes: number;
  /** 站内通知总数 */
  notifications: number;
  /** 其中还没读的 */
  unreadNotifications: number;
  /** 收藏总数 */
  favorites: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const [content, cats, tags, users, subs, views, media, notices, favs] =
    await Promise.all([
      query<any>(
        `SELECT
           SUM(type = 'site')    AS sites,
           SUM(type = 'article') AS articles,
           SUM(type = 'app')     AS apps
         FROM knav_contents WHERE status = 'publish'`
      ),
      query<any>("SELECT COUNT(*) AS n FROM knav_categories"),
      query<any>("SELECT COUNT(*) AS n FROM knav_tags"),
      query<any>(
        `SELECT COUNT(*) AS n, SUM(status = 'pending') AS pending FROM knav_users`
      ),
      query<any>(
        `SELECT COUNT(*) AS n, SUM(status = 'pending') AS pending,
                SUM(DATE(created_at) = CURDATE()) AS today
         FROM knav_submissions`
      ),
      query<any>("SELECT COALESCE(SUM(views), 0) AS total FROM knav_contents"),
      query<any>(
        "SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM knav_media"
      ),
      query<any>(
        `SELECT COUNT(*) AS n, SUM(is_read = 0) AS unread FROM knav_notifications`
      ),
      query<any>("SELECT COUNT(*) AS n FROM knav_favorites"),
    ]);

  const c = content[0] || {};
  const u = users[0] || {};
  const s = subs[0] || {};

  return {
    sites: Number(c.sites) || 0,
    articles: Number(c.articles) || 0,
    apps: Number(c.apps) || 0,
    categories: Number(cats[0]?.n) || 0,
    tags: Number(tags[0]?.n) || 0,
    users: Number(u.n) || 0,
    pendingUsers: Number(u.pending) || 0,
    pendingSubmissions: Number(s.pending) || 0,
    totalViews: Number(views[0]?.total) || 0,
    todaySubmissions: Number(s.today) || 0,
    media: Number(media[0]?.n) || 0,
    mediaBytes: Number(media[0]?.bytes) || 0,
    notifications: Number(notices[0]?.n) || 0,
    unreadNotifications: Number(notices[0]?.unread) || 0,
    favorites: Number(favs[0]?.n) || 0,
  };
}

/* ---------------------------------------------------------------- 分类 */

/**
 * 别名冲突时加序号后缀（-2、-3…）。
 * 拼音首字母重名很常见（「羊毛相关」「域名相关」都是 ymxg），自动生成时不该直接报错。
 */
async function uniqueSlug(base: string, exceptId = 0): Promise<string> {
  const isFree = async (slug: string) => {
    const row = exceptId
      ? await queryOne<{ id: number }>(
          "SELECT id FROM knav_categories WHERE slug = ? AND id <> ? LIMIT 1",
          [slug, exceptId]
        )
      : await queryOne<{ id: number }>(
          "SELECT id FROM knav_categories WHERE slug = ? LIMIT 1",
          [slug]
        );
    return !row;
  };

  if (await isFree(base)) return base;
  for (let n = 2; n <= 60; n++) {
    const candidate = `${base}-${n}`;
    if (await isFree(candidate)) return candidate;
  }
  return "";
}

/** 新增分类 */
export async function createCategory(input: {
  name: string;
  slug: string;
  description?: string;
  parent?: number;
  icon?: string;
  cover?: string;
  color?: string;
  order?: number;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "分类名不能为空" };

  const manual = (input.slug?.trim() ?? "").toLowerCase();
  let slug = manual || pinyinInitials(name) || name.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: "别名只能包含小写字母、数字和连字符" };
  }

  if (manual) {
    const exists = await queryOne<{ id: number }>(
      "SELECT id FROM knav_categories WHERE slug = ? LIMIT 1",
      [slug]
    );
    if (exists) return { ok: false, error: "该别名已存在" };
  } else {
    // 自动生成的别名冲突了不该打断用户，加后缀即可
    slug = await uniqueSlug(slug);
    if (!slug) return { ok: false, error: "别名重名过多，请手动填写一个" };
  }

  const res = await execute(
    `INSERT INTO knav_categories (parent_id, name, slug, description, icon, cover, color, sort_order)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      Number(input.parent) || 0,
      name,
      slug,
      input.description?.trim() ?? "",
      input.icon?.trim() ?? "",
      input.cover?.trim() ?? "",
      input.color?.trim() ?? "",
      Number(input.order) || 0,
    ]
  );
  return { ok: true, id: res.insertId };
}

/** 修改分类 */
export async function updateCategory(input: {
  id: number;
  name: string;
  slug: string;
  description?: string;
  parent?: number;
  icon?: string;
  cover?: string;
  color?: string;
  order?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "分类名不能为空" };

  const manual = (input.slug?.trim() ?? "").toLowerCase();
  let slug = manual || pinyinInitials(name) || name.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: "别名只能包含小写字母、数字和连字符" };
  }

  const dup = await queryOne<{ id: number }>(
    "SELECT id FROM knav_categories WHERE slug = ? AND id <> ? LIMIT 1",
    [slug, input.id]
  );
  if (dup) {
    if (manual) return { ok: false, error: "该别名已被其它分类占用" };
    slug = await uniqueSlug(slug, input.id);
    if (!slug) return { ok: false, error: "别名重名过多，请手动填写一个" };
  }

  const fields = [
    "name = ?",
    "slug = ?",
    "description = ?",
    "parent_id = ?",
    "icon = ?",
    "cover = ?",
    "color = ?",
    "sort_order = ?",
  ];
  const params = [
    name,
    slug,
    input.description?.trim() ?? "",
    Number(input.parent) || 0,
    input.icon?.trim() ?? "",
    input.cover?.trim() ?? "",
    input.color?.trim() ?? "",
    Number(input.order) || 0,
    input.id,
  ];
  const res = await execute(
    `UPDATE knav_categories SET ${fields.join(", ")} WHERE id = ?`,
    params
  );
  return res.affectedRows === 0 ? { ok: false, error: "分类不存在" } : { ok: true };
}

/** 删除分类（会同时解除内容关联） */
export async function deleteCategory(id: number): Promise<{ ok: boolean; error?: string }> {
  const exists = await queryOne<{ id: number }>(
    "SELECT id FROM knav_categories WHERE id = ? LIMIT 1",
    [id]
  );
  if (!exists) return { ok: false, error: "分类不存在" };

  await transaction(async (conn) => {
    // 分类删掉后，关联表里指向它的记录一并清掉；
    // 主分类被删的内容若还属于其它分类，改用其中最小的那个当主分类。
    await conn.query(
      "DELETE FROM knav_content_categories WHERE category_id = ?",
      [id]
    );
    await conn.query(
      `UPDATE knav_contents c
       SET c.category_id = COALESCE(
         (SELECT MIN(cc.category_id) FROM knav_content_categories cc
           WHERE cc.content_id = c.id), 0)
       WHERE c.category_id = ?`,
      [id]
    );
    // 子分类提升为顶级分类，避免整棵子树被孤儿化
    await conn.query("UPDATE knav_categories SET parent_id = 0 WHERE parent_id = ?", [id]);
    await conn.query("DELETE FROM knav_categories WHERE id = ?", [id]);
  });
  return { ok: true };
}

/* ---------------------------------------------------------------- 内容 */

export type { AdminContentDetail };

export interface AdminContentRow {
  id: number;
  type: "site" | "article" | "app";
  title: string;
  status: string;
  author: string;
  categoryName: string;
  views: number;
  date: string;
  /** 是否置顶 */
  sticky: number;
  /** 排序权重 */
  order: number;
  /** 封面图 */
  cover: string;
  /** 自定义图标 */
  icon: string;
  /** 以下字段供后台就地编辑直接回填，省掉一次打开表单的往返 */
  url: string;
  description: string;
  tags: string;
  categoryIds: number[];
}

/** 内容列表（后台用，支持按类型/分类/关键词过滤） */
export async function listAdminContent(opts: {
  type?: string;
  keyword?: string;
  status?: string;
  categoryId?: number;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: AdminContentRow[]; total: number }> {
  const { type, keyword, status, categoryId, limit = 30, offset = 0 } = opts;

  const where: string[] = ["1=1"];
  const params: any[] = [];
  if (type) {
    where.push("c.type = ?");
    params.push(type);
  }
  if (status) {
    where.push("c.status = ?");
    params.push(status);
  }
  if (keyword) {
    where.push("c.title LIKE ?");
    params.push(`%${keyword}%`);
  }
  const categoryIds =
    categoryId && categoryId > 0 ? await expandCategoryIds(categoryId) : [];
  if (categoryIds.length > 0) {
    // 选顶级分类要连带列出它下面所有子分类的内容，跟前台读法一致
    const marks = categoryIds.map(() => "?").join(",");
    where.push(
      `(c.category_id IN (${marks}) OR c.id IN (
         SELECT cc.content_id FROM knav_content_categories cc
         WHERE cc.category_id IN (${marks})
       ))`
    );
    params.push(...categoryIds, ...categoryIds);
  }
  const clause = where.join(" AND ");

  const totalRow = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM knav_contents c WHERE ${clause}`,
    params
  );

  const rows = await query<any>(
    `SELECT c.id, c.type, c.title, c.status, c.created_at, c.views, c.sticky,
            c.sort_order, c.cover, c.icon, c.url, c.description, c.category_id,
            COALESCE(
              (SELECT GROUP_CONCAT(cat2.name ORDER BY cat2.sort_order ASC, cat2.id ASC SEPARATOR '、')
                 FROM knav_content_categories cc
                 JOIN knav_categories cat2 ON cat2.id = cc.category_id
                WHERE cc.content_id = c.id),
              cat.name, ''
            ) AS category_name
     FROM knav_contents c
     LEFT JOIN knav_categories cat ON cat.id = c.category_id
     WHERE ${clause}
     ORDER BY c.sticky DESC, c.sort_order ASC, c.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // 列表页顺带带上标签与全部关联分类：网址编辑打开时可直接回填，不必再请求一次
  const ids = rows.map((r) => Number(r.id));
  const tagMap = new Map<number, string[]>();
  const catMap = new Map<number, number[]>();
  if (ids.length > 0) {
    const marks = ids.map(() => "?").join(",");
    const [tagRows, catRows] = await Promise.all([
      query<{ content_id: number; name: string }>(
        `SELECT ct.content_id, t.name
         FROM knav_content_tags ct
         JOIN knav_tags t ON t.id = ct.tag_id
         WHERE ct.content_id IN (${marks})
         ORDER BY t.id ASC`,
        ids
      ),
      query<{ content_id: number; category_id: number }>(
        `SELECT content_id, category_id
         FROM knav_content_categories
         WHERE content_id IN (${marks})
         ORDER BY category_id ASC`,
        ids
      ),
    ]);
    for (const t of tagRows) {
      const id = Number(t.content_id);
      const list = tagMap.get(id);
      if (list) list.push(t.name);
      else tagMap.set(id, [t.name]);
    }
    for (const c of catRows) {
      const id = Number(c.content_id);
      const list = catMap.get(id);
      if (list) list.push(Number(c.category_id));
      else catMap.set(id, [Number(c.category_id)]);
    }
  }

  return {
    items: rows.map((r) => {
      const id = Number(r.id);
      const primary = Number(r.category_id) || 0;
      return {
        id,
        type: (r.type === "site" || r.type === "app" ? r.type : "article") as
          | "site"
          | "article"
          | "app",
        title: r.title ?? "",
        status: r.status ?? "",
        author: "",
        categoryName: r.category_name ?? "",
        views: Number(r.views) || 0,
        date: r.created_at ?? "",
        sticky: Number(r.sticky) || 0,
        order: Number(r.sort_order) || 0,
        cover: r.cover ?? "",
        icon: r.icon ?? "",
        url: r.url ?? "",
        description: r.description ?? "",
        tags: (tagMap.get(id) ?? []).join(", "),
        categoryIds: [
          ...new Set([...(primary ? [primary] : []), ...(catMap.get(id) ?? [])]),
        ],
      };
    }),
    total: Number(totalRow?.n) || 0,
  };
}

/** 读取单条内容的完整信息（后台编辑用） */
export async function getAdminContentDetail(
  id: number
): Promise<AdminContentDetail | null> {
  const row = await queryOne<any>(
    `SELECT id, type, title, url, description, content_md, icon, cover,
            category_id, sticky, sort_order, status, created_at
     FROM knav_contents WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!row) return null;

  const tagRows = await query<{ name: string }>(
    `SELECT t.name FROM knav_content_tags ct
     JOIN knav_tags t ON t.id = ct.tag_id
     WHERE ct.content_id = ? ORDER BY t.id ASC`,
    [id]
  );

  const catRows = await query<{ category_id: number }>(
    "SELECT category_id FROM knav_content_categories WHERE content_id = ?",
    [id]
  );
  const primaryCategory = Number(row.category_id) || 0;
  const categoryIds = [
    ...new Set([
      ...(primaryCategory ? [primaryCategory] : []),
      ...catRows.map((c) => Number(c.category_id)).filter((n) => n > 0),
    ]),
  ];

  // 同一个软件可以挂多个平台版本（knav_downloads），
  // 每个平台版本下还能有多个镜像链接（knav_download_mirrors）。
  // 内容管理里只编辑「主镜像」（sort 最小的那条），其余镜像在下载管理维护。
  const versionRows = await query<{
    id: number;
    platform: string;
    arch: string;
    version: string;
    file_size: string;
    mirror_name: string | null;
    mirror_url: string | null;
    mirror_count: number;
  }>(
    `SELECT d.id, d.platform, d.arch, d.version, d.file_size,
            pm.name AS mirror_name, pm.url AS mirror_url,
            (SELECT COUNT(*) FROM knav_download_mirrors x WHERE x.download_id = d.id) AS mirror_count
     FROM knav_downloads d
     LEFT JOIN knav_download_mirrors pm
       ON pm.id = (SELECT m.id FROM knav_download_mirrors m
                   WHERE m.download_id = d.id ORDER BY m.sort_order ASC, m.id ASC LIMIT 1)
     WHERE d.content_id = ? ORDER BY d.sort_order ASC, d.id ASC`,
    [id]
  );

  const versions = versionRows.map((v) => ({
    id: Number(v.id) || undefined,
    name: v.mirror_name ?? "",
    platform: v.platform ?? "",
    arch: v.arch ?? "",
    version: v.version ?? "",
    url: v.mirror_url ?? "",
    fileSize: v.file_size ?? "",
    mirrorCount: Number(v.mirror_count) || 0,
  }));

  return {
    id: Number(row.id),
    type: (row.type === "site" || row.type === "app" ? row.type : "article") as
      | "site"
      | "article"
      | "app",
    title: row.title ?? "",
    url: row.url ?? "",
    description: row.description ?? "",
    contentMd: row.content_md ?? "",
    categoryId: primaryCategory,
    categoryIds,
    tags: tagRows.map((t) => t.name).join(", "),
    icon: row.icon ?? "",
    cover: row.cover ?? "",
    order: Number(row.sort_order) || 0,
    sticky: Number(row.sticky) || 0,
    status: row.status ?? "",
    date: String(row.created_at ?? "").slice(0, 10),
    version: versions[0]?.version ?? "",
    platform: versions[0]?.platform ?? "",
    versions,
  };
}

/** 修改内容状态（草稿 / 发布 / 回收站） */
export async function setContentStatus(
  id: number,
  status: "publish" | "draft" | "trash"
): Promise<{ ok: boolean; error?: string }> {
  const res = await execute("UPDATE knav_contents SET status = ? WHERE id = ?", [
    status,
    id,
  ]);
  if (res.affectedRows === 0) return { ok: false, error: "内容不存在" };
  return { ok: true };
}

/** 删除内容（含标签关联与下载数据） */
export async function deleteContent(id: number): Promise<{ ok: boolean; error?: string }> {
  const exists = await queryOne<{ id: number }>(
    "SELECT id FROM knav_contents WHERE id = ? LIMIT 1",
    [id]
  );
  if (!exists) return { ok: false, error: "内容不存在" };

  await transaction(async (conn) => {
    await conn.query("DELETE FROM knav_content_tags WHERE content_id = ?", [id]);
    await conn.query("DELETE FROM knav_content_categories WHERE content_id = ?", [id]);
    await conn.query("DELETE FROM knav_content_links WHERE content_id = ?", [id]);
    await conn.query("DELETE FROM knav_favorites WHERE content_id = ?", [id]);
    // 软件的平台版本与镜像链接一并清掉
    await conn.query(
      `DELETE FROM knav_download_mirrors
       WHERE download_id IN (SELECT id FROM knav_downloads WHERE content_id = ?)`,
      [id]
    );
    await conn.query("DELETE FROM knav_downloads WHERE content_id = ?", [id]);
    await conn.query("DELETE FROM knav_contents WHERE id = ?", [id]);
  });
  return { ok: true };
}

/* ------------------------------------------- 下载：软件 → 平台版本 → 镜像链接 */

/** 平台版本下的一个镜像下载链接 */
export interface AdminMirrorRow {
  id: number;
  downloadId: number;
  /** 镜像名称：官方下载 / 百度网盘 / 123网盘 / App Store / Google Play / App Gallery … */
  name: string;
  url: string;
  fileSize: string;
  note: string;
  enabled: number;
  count: number;
  sort: number;
}

/** 软件的一个平台版本 */
export interface AdminPlatformRow {
  id: number;
  contentId: number;
  /** 软件显示名（留空则用内容标题） */
  resourceTitle: string;
  platform: string;
  /** 架构：x64 / x86 / ARM64 / universal …，留空表示不限 */
  arch: string;
  version: string;
  fileSize: string;
  sha256: string;
  preview: string;
  note: string;
  enabled: number;
  count: number;
  sort: number;
  /** 该平台下的镜像链接 */
  mirrors: AdminMirrorRow[];
}

/** 按软件分组的下载数据（下载管理页的展示单位） */
export interface AdminSoftwareRow {
  contentId: number;
  /** 显示名：resource_title 优先，否则用内容标题 */
  title: string;
  contentTitle: string;
  resourceTitle: string;
  platforms: AdminPlatformRow[];
}

/**
 * 下载管理列表：按软件分组，每个软件下挂若干平台版本，每个平台版本下挂若干镜像链接。
 */
export async function listDownloadSoftwares(
  opts: { keyword?: string; contentId?: number } = {}
): Promise<AdminSoftwareRow[]> {
  const where: string[] = [];
  const params: any[] = [];

  if (opts.contentId) {
    where.push("d.content_id = ?");
    params.push(opts.contentId);
  }
  const kw = opts.keyword?.trim();
  if (kw) {
    where.push("(p.title LIKE ? OR d.resource_title LIKE ?)");
    params.push(`%${kw}%`, `%${kw}%`);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await query<any>(
    `SELECT d.*, p.title AS content_title
     FROM knav_downloads d
     LEFT JOIN knav_contents p ON p.id = d.content_id
     ${clause}
     ORDER BY d.content_id ASC, d.sort_order ASC, d.id ASC`,
    params
  );
  if (rows.length === 0) return [];

  // 一次性把这些平台版本的镜像全捞出来，避免逐行查询
  const ids = rows.map((r) => Number(r.id));
  const placeholders = ids.map(() => "?").join(",");
  const mirrorRows = await query<any>(
    `SELECT * FROM knav_download_mirrors WHERE download_id IN (${placeholders})
     ORDER BY sort_order ASC, id ASC`,
    ids
  );
  const mirrorsByDownload = new Map<number, AdminMirrorRow[]>();
  for (const m of mirrorRows) {
    const did = Number(m.download_id) || 0;
    const list = mirrorsByDownload.get(did) ?? [];
    list.push({
      id: Number(m.id),
      downloadId: did,
      name: m.name ?? "",
      url: m.url ?? "",
      fileSize: m.file_size ?? "",
      note: m.note ?? "",
      enabled: Number(m.enabled) === 0 ? 0 : 1,
      count: Number(m.count) || 0,
      sort: Number(m.sort_order) || 0,
    });
    mirrorsByDownload.set(did, list);
  }

  const softwareByContent = new Map<number, AdminSoftwareRow>();
  for (const r of rows) {
    const contentId = Number(r.content_id) || 0;
    const contentTitle = r.content_title ?? "";
    const resourceTitle = (r.resource_title ?? "").trim();
    let soft = softwareByContent.get(contentId);
    if (!soft) {
      soft = {
        contentId,
        title: resourceTitle || contentTitle || `#${contentId}`,
        contentTitle,
        resourceTitle,
        platforms: [],
      };
      softwareByContent.set(contentId, soft);
    } else if (resourceTitle && !soft.resourceTitle) {
      soft.resourceTitle = resourceTitle;
      soft.title = resourceTitle;
    }
    const id = Number(r.id);
    soft.platforms.push({
      id,
      contentId,
      resourceTitle,
      platform: r.platform ?? "",
      arch: r.arch ?? "",
      version: r.version ?? "",
      fileSize: r.file_size ?? "",
      sha256: r.sha256 ?? "",
      preview: r.preview ?? "",
      note: r.note ?? "",
      enabled: Number(r.enabled) === 0 ? 0 : 1,
      count: Number(r.count) || 0,
      sort: Number(r.sort_order) || 0,
      mirrors: mirrorsByDownload.get(id) ?? [],
    });
  }

  // 软件名排序，方便后台按名字找
  return [...softwareByContent.values()].sort((a, b) =>
    a.title.localeCompare(b.title, "zh-Hans-CN")
  );
}

/** 下载数据总量（后台首页统计用） */
export async function countDownloads(): Promise<{ platforms: number; mirrors: number }> {
  const row = await queryOne<{ p: number; m: number }>(
    `SELECT (SELECT COUNT(*) FROM knav_downloads) AS p,
            (SELECT COUNT(*) FROM knav_download_mirrors) AS m`
  );
  return { platforms: Number(row?.p) || 0, mirrors: Number(row?.m) || 0 };
}

/* ---------------------------------------------------------------- 邮件日志 */

export async function listMailLogs(opts: {
  limit?: number;
  offset?: number;
} = {}): Promise<{
  items: { id: number; to: string; subject: string; status: string; error: string; createdAt: string }[];
  total: number;
}> {
  const { limit = 30, offset = 0 } = opts;
  const totalRow = await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM knav_mail_log");
  const rows = await query<any>(
    "SELECT id, to_email, subject, status, error, created_at FROM knav_mail_log ORDER BY id DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      to: r.to_email ?? "",
      subject: r.subject ?? "",
      status: r.status ?? "",
      error: r.error ?? "",
      createdAt: r.created_at ?? "",
    })),
    total: Number(totalRow?.n) || 0,
  };
}

export async function getMailLogBody(id: number): Promise<string | null> {
  const row = await queryOne<{ body: string }>(
    "SELECT body FROM knav_mail_log WHERE id = ? LIMIT 1",
    [id]
  );
  return row?.body ?? null;
}

/* ---------------------------------------------------------------- 站内通知日志 */

export interface AdminNotificationRow {
  id: number;
  userId: number;
  username: string;
  email: string;
  type: string;
  title: string;
  body: string;
  link: string;
  isRead: boolean;
  createdAt: string;
}

export async function listNotifications(opts: {
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: AdminNotificationRow[]; total: number }> {
  const { limit = 30, offset = 0 } = opts;
  const totalRow = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM knav_notifications"
  );
  const rows = await query<any>(
    `SELECT n.id, n.user_id, n.type, n.title, n.body, n.link, n.is_read, n.created_at,
            u.username, u.email
     FROM knav_notifications n
     LEFT JOIN knav_users u ON u.id = n.user_id
     ORDER BY n.id DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      username: r.username ?? "（已删除用户）",
      email: r.email ?? "",
      type: r.type ?? "",
      title: r.title ?? "",
      body: r.body ?? "",
      link: r.link ?? "",
      isRead: Number(r.is_read) === 1,
      createdAt: r.created_at ?? "",
    })),
    total: Number(totalRow?.n) || 0,
  };
}

/* ---------------------------------------------------------------- 设置 */

/** 读取全部设置（含默认值回退，表单里不会因为没存过而显示空白） */
export async function getSettings(): Promise<Record<string, string>> {
  return getSettingMap({ fresh: true });
}

/** 写入设置（空值不覆盖） */
export async function saveSettings(
  data: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return { ok: true };
  await transaction(async (conn) => {
    for (const [name, value] of entries) {
      await conn.query(
        `INSERT INTO knav_settings (name, value) VALUES (?,?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [name, value]
      );
    }
  });
  return { ok: true };
}

/** 读取单个设置 */
export async function getSetting(name: string): Promise<string> {
  const row = await queryOne<{ value: string }>(
    "SELECT value FROM knav_settings WHERE name = ? LIMIT 1",
    [name]
  );
  return row?.value ?? "";
}
