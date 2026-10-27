// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  require("server-only");
}
import bcrypt from "bcryptjs";
import { query, queryOne, execute, transaction } from "./db";
import { localizeImage, localizeContentImages } from "./media";
import { replaceContentCategories } from "./content-categories";
import { refreshTagCounts } from "./counters";
import type { PlatformVersion } from "./admin-types";

export type { PlatformVersion };

/**
 * 后台写操作。
 *
 * 全部作用在 knav 自己的表上，与前台读取路径完全一致：
 * 新建的内容立刻出现在前台，后台改完不需要任何同步动作。
 */

export type ContentType = "site" | "article" | "app";
export type ContentStatus = "publish" | "draft" | "trash";

function now(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/** 生成别名 */
export function toSlug(input: string): string {
  const s = (input || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return s || `item-${Date.now().toString(36)}`;
}

/* ---------------------------------------------------------------- 内容 */

export interface ContentInput {
  type: ContentType;
  title: string;
  url?: string;
  description?: string;
  contentMd?: string;
  /** 单分类（下载管理等旧调用方用） */
  categoryId?: number;
  /** 多分类：第一个同时作为主分类写入 knav_contents.category_id */
  categoryIds?: number[];
  tags?: string;
  cover?: string;
  icon?: string;
  order?: number;
  sticky?: number;
  status?: ContentStatus;
  date?: string;
  /** 下载类：版本 / 平台 / 下载地址 */
  version?: string;
  platform?: string;
  /**
   * 下载类：同一个软件的多个平台版本。
   * undefined = 这次没动平台版本列表（不覆盖「下载管理」里已有的记录）；
   * [] = 明确清空；非空 = 按列表重建。
   */
  versions?: PlatformVersion[];
}

/** 新建内容 */
export async function createContent(
  input: ContentInput
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "标题不能为空" };
  if (input.type === "site" && !input.url?.trim()) {
    return { ok: false, error: "网址必须填写链接地址" };
  }

  const status = input.status ?? "publish";
  const when = input.date?.trim() || now();
  const content =
    input.type === "article" ? input.contentMd ?? "" : input.description ?? "";
  const categoryIds =
    input.categoryIds ??
    (Number(input.categoryId) > 0 ? [Number(input.categoryId)] : []);
  const primaryCategory = categoryIds[0] ?? 0;

  const result = await transaction(async (conn) => {
    const [res] = await conn.query(
      `INSERT INTO knav_contents
         (type, title, slug, url, description, content_md, icon, cover,
          category_id, views, likes, sticky, sort_order, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,0,0,?,?,?,?,?)`,
      [
        input.type,
        title,
        toSlug(title),
        input.url?.trim() ?? "",
        input.description ?? "",
        content,
        input.icon?.trim() ?? "",
        input.cover?.trim() ?? "",
        primaryCategory,
        input.sticky ?? 0,
        input.order ?? 0,
        status,
        when,
        when,
      ]
    );
    const id = (res as any).insertId as number;

    await linkTags(conn, id, input.tags);
    return { ok: true as const, id };
  });

  // 多平台版本写入 knav_downloads（放在事务外，避免和事务抢锁）
  if (result.ok) {
    if (categoryIds.length > 0) {
      await replaceContentCategories(result.id, categoryIds);
    }
    const versions = input.versions ?? legacyVersions(input);
    if (versions.length > 0) {
      await syncPlatformVersions(result.id, versions);
    }
  }
  return result;
}

/**
 * 表单里只有单个「平台 / 版本 / 地址」输入框时，
 * 把它折算成一条平台版本，和多平台版本列表走同一套写入逻辑。
 * 只有软件（app）才有下载信息，网址收藏的 url 是目标站点地址。
 */
function legacyVersions(input: ContentInput): PlatformVersion[] {
  if (input.type !== "app") return [];
  const platform = input.platform?.trim();
  const version = input.version?.trim();
  const url = input.url?.trim();
  if (!platform && !version && !url) return [];
  return [
    {
      name: "官方下载",
      platform: platform || "通用",
      arch: "",
      version: version || "",
      url: url || "",
      fileSize: "",
    },
  ];
}

/**
 * 同步软件的平台版本列表到 knav_downloads。
 *
 * 同一个软件可以有 Windows / macOS / Linux / Android / OpenWrt 等多个平台版本，
 * 每个平台版本下还能挂多个镜像链接（官方下载 / 网盘 / 应用商店…）。
 *
 * 这里按「平台 + 版本」做增量匹配，不是先删后插：
 * 命中的记录只更新排序与大小，它在「下载管理」里维护的镜像链接原样保留；
 * 表单里的主链接对应 sort 最小的那条镜像（没有镜像时才新建一条）。
 */
async function syncPlatformVersions(
  contentId: number,
  versions: PlatformVersion[]
): Promise<void> {
  const rows = versions
    .map((v) => ({
      id: Number(v.id) > 0 ? Number(v.id) : undefined,
      name: (v.name ?? "").trim(),
      platform: (v.platform ?? "").trim() || "通用",
      arch: (v.arch ?? "").trim(),
      version: (v.version ?? "").trim(),
      url: (v.url ?? "").trim(),
      fileSize: (v.fileSize ?? "").trim(),
    }))
    .filter((v) => v.id || v.platform !== "通用" || v.url || v.version);

  const existing = await query<{ id: number; platform: string; version: string }>(
    "SELECT id, platform, version FROM knav_downloads WHERE content_id = ? ORDER BY sort_order ASC, id ASC",
    [contentId]
  );

  const used = new Set<number>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // 先按 ID 精确匹配：改了版本号也不会被当成新记录，它下面的镜像链接才不会丢。
    // 没有 ID（新增行）或 ID 已不属于该软件时，退回按「平台 + 版本」匹配。
    const hit =
      (r.id ? existing.find((e) => !used.has(e.id) && e.id === r.id) : undefined) ??
      existing.find(
        (e) => !used.has(e.id) && e.platform === r.platform && e.version === r.version
      );

    if (hit) {
      used.add(hit.id);
      await execute(
        "UPDATE knav_downloads SET platform = ?, arch = ?, version = ?, file_size = ?, sort_order = ? WHERE id = ?",
        [r.platform, r.arch, r.version, r.fileSize, i, hit.id]
      );
      await upsertPrimaryMirror(hit.id, r.name, r.url, r.fileSize);
      continue;
    }

    const res = await execute(
      `INSERT INTO knav_downloads (content_id, platform, arch, version, file_size, sort_order)
       VALUES (?,?,?,?,?,?)`,
      [contentId, r.platform, r.arch, r.version, r.fileSize, i]
    );
    used.add(res.insertId);
    if (r.url) {
      await execute(
        `INSERT INTO knav_download_mirrors (download_id, name, url, file_size, sort_order)
         VALUES (?,?,?,?,0)`,
        [res.insertId, r.name || "官方下载", r.url, r.fileSize]
      );
    }
  }

  // 表单里已经删掉的平台版本：连镜像一起清掉
  const stale = existing.filter((e) => !used.has(e.id)).map((e) => e.id);
  if (stale.length > 0) {
    const placeholders = stale.map(() => "?").join(",");
    await execute(
      `DELETE FROM knav_download_mirrors WHERE download_id IN (${placeholders})`,
      stale
    );
    await execute(`DELETE FROM knav_downloads WHERE id IN (${placeholders})`, stale);
  }
}

/**
 * 写入 / 更新「主镜像」：sort 最小的那条。
 * 内容管理页只有一个链接输入框，对应的就是它；
 * 其余镜像（网盘、应用商店等）在下载管理里维护，这里不动。
 */
async function upsertPrimaryMirror(
  downloadId: number,
  name: string,
  url: string,
  fileSize: string
): Promise<void> {
  const primary = await queryOne<{ id: number }>(
    "SELECT id FROM knav_download_mirrors WHERE download_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1",
    [downloadId]
  );
  if (!primary) {
    if (!url) return;
    await execute(
      `INSERT INTO knav_download_mirrors (download_id, name, url, file_size, sort_order)
       VALUES (?,?,?,?,0)`,
      [downloadId, name || "官方下载", url, fileSize]
    );
    return;
  }
  if (!url) return; // 主镜像已存在但表单里链接留空：保留原地址，不清空
  await execute(
    "UPDATE knav_download_mirrors SET name = ?, url = ?, file_size = ? WHERE id = ?",
    [name || "官方下载", url, fileSize, primary.id]
  );
}

/**
 * 保存后本地化外链资源（在响应发出后由 after() 调用）。
 *
 * 拉到本地就替换成站内地址；失败保留原地址。更新语句带上原值条件，
 * 避免后台任务把用户随后保存的新内容覆盖掉。
 */
export async function localizeContentAssets(
  id: number,
  input: ContentInput
): Promise<void> {
  const jobs: Promise<void>[] = [];
  const icon = input.icon?.trim() ?? "";
  const cover = input.cover?.trim() ?? "";
  const md = input.type === "article" ? input.contentMd ?? "" : "";

  if (icon) jobs.push(localizeField(id, "icon", icon));
  if (cover) jobs.push(localizeField(id, "cover", cover));
  if (md) jobs.push(localizeField(id, "content_md", md));

  await Promise.allSettled(jobs);
}

async function localizeField(
  id: number,
  column: "icon" | "cover" | "content_md",
  raw: string
): Promise<void> {
  try {
    const localized =
      column === "content_md"
        ? await localizeContentImages(raw)
        : await localizeImage(raw);
    if (!localized || localized === raw) return;
    await execute(
      `UPDATE knav_contents SET ${column} = ? WHERE id = ? AND ${column} = ?`,
      [localized, id, raw]
    );
  } catch {
    /* 本地化失败保留远程地址，不影响已保存的内容 */
  }
}

/** 修改内容 */
export async function updateContent(
  id: number,
  input: ContentInput
): Promise<{ ok: boolean; error?: string }> {
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "标题不能为空" };

  const row = await queryOne<{ type: string; url: string }>(
    "SELECT type, url FROM knav_contents WHERE id = ? LIMIT 1",
    [id]
  );
  if (!row) return { ok: false, error: "内容不存在" };

  const content =
    row.type === "article" ? input.contentMd ?? "" : input.description ?? "";
  const status = input.status ?? "publish";
  const when = input.date?.trim() || now();
  const nextUrl = input.url?.trim() ?? "";

  await execute(
    `UPDATE knav_contents
     SET title = ?, slug = ?, url = ?, description = ?, content_md = ?,
         icon = ?, cover = ?, sticky = ?, sort_order = ?, status = ?,
         created_at = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      title,
      toSlug(title),
      nextUrl,
      input.description ?? "",
      content,
      input.icon?.trim() ?? "",
      input.cover?.trim() ?? "",
      input.sticky ?? 0,
      input.order ?? 0,
      status,
      when,
      id,
    ]
  );

  // 网址换了，旧的短链缓存作废，下次点「直达」重新生成
  if (row.type === "site" && nextUrl !== (row.url ?? "")) {
    await execute("UPDATE knav_contents SET short_url = '' WHERE id = ?", [id]);
  }

  if (input.categoryIds !== undefined || input.categoryId !== undefined) {
    const categoryIds =
      input.categoryIds ??
      (Number(input.categoryId) > 0 ? [Number(input.categoryId)] : []);
    await execute("UPDATE knav_contents SET category_id = ? WHERE id = ?", [
      categoryIds[0] ?? 0,
      id,
    ]);
    await replaceContentCategories(id, categoryIds);
  }
  if (input.tags !== undefined) {
    await linkTags(null, id, input.tags);
  }

  // 平台版本：只有这次动过列表才覆盖，避免把「下载管理」里维护的记录冲掉
  if (input.versions !== undefined) {
    await syncPlatformVersions(id, input.versions);
  }
  return { ok: true };
}

/**
 * 关联标签（先复用已有标签，再新建）。
 * tags 为逗号分隔的标签名。
 */
async function linkTags(
  conn: any,
  contentId: number,
  tags?: string
): Promise<void> {
  if (tags === undefined) return;
  const names = (tags || "")
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (names.length === 0) return;

  const run = async (sql: string, params: any[]) => {
    if (conn) {
      const [rows] = await conn.query(sql, params);
      return Array.isArray(rows[0]) ? rows[0] : rows;
    }
    return query(sql, params);
  };

  for (const name of names) {
    const slug = toSlug(name);
    const existing = await run(
      "SELECT id FROM knav_tags WHERE name = ? OR slug = ? ORDER BY (name = ?) DESC LIMIT 1",
      [name, slug, name]
    );
    let tagId = Number(existing?.[0]?.id) || 0;
    if (!tagId) {
      let finalSlug = slug;
      const dup = await run("SELECT id FROM knav_tags WHERE slug = ? LIMIT 1", [finalSlug]);
      if (dup.length > 0) finalSlug = `${slug}-${Date.now().toString(36)}`;
      const ins = await run("INSERT INTO knav_tags (name, slug) VALUES (?,?)", [name, finalSlug]);
      const r = Array.isArray(ins) && Array.isArray(ins[0]) ? ins[0] : ins;
      tagId = Number(r?.insertId) || 0;
    }
    if (!tagId) continue;
    await run(
      "INSERT IGNORE INTO knav_content_tags (content_id, tag_id) VALUES (?,?)",
      [contentId, tagId]
    );
  }
  await refreshTagCounts();
}

/** 刷新标签计数 */
export { refreshTagCounts };

/** 批量操作内容 */
export async function bulkContent(
  ids: number[],
  op: "publish" | "draft" | "trash" | "delete" | "sticky" | "unstick" | "category",
  extra?: { categoryId?: number }
): Promise<{ ok: boolean; affected: number; error?: string }> {
  if (ids.length === 0) return { ok: true, affected: 0 };
  const placeholders = ids.map(() => "?").join(",");

  if (op === "category") {
    const categoryId = extra?.categoryId ?? 0;
    if (!categoryId) return { ok: false, affected: 0, error: "请选择目标分类" };
    const exists = await queryOne<{ id: number }>(
      "SELECT id FROM knav_categories WHERE id = ? LIMIT 1",
      [categoryId]
    );
    if (!exists) return { ok: false, affected: 0, error: "目标分类不存在" };
    const affected = await transaction(async (conn) => {
      const [res] = await conn.query(
        `UPDATE knav_contents SET category_id = ? WHERE id IN (${placeholders})`,
        [categoryId, ...ids]
      );
      await conn.query(
        `DELETE FROM knav_content_categories WHERE content_id IN (${placeholders})`,
        ids
      );
      await conn.query(
        `INSERT IGNORE INTO knav_content_categories (content_id, category_id)
         VALUES ${ids.map(() => "(?,?)").join(",")}`,
        ids.flatMap((cid) => [cid, categoryId])
      );
      return (res as any).affectedRows as number;
    });
    return { ok: true, affected };
  }

  if (op === "delete") {
    const res = await execute(
      `DELETE FROM knav_contents WHERE id IN (${placeholders})`,
      ids
    );
    await execute(
      `DELETE FROM knav_content_tags WHERE content_id IN (${placeholders})`,
      ids
    );
    await execute(
      `DELETE FROM knav_content_categories WHERE content_id IN (${placeholders})`,
      ids
    );
    await execute(
      `DELETE FROM knav_content_links WHERE content_id IN (${placeholders})`,
      ids
    );
    await execute(
      `DELETE FROM knav_favorites WHERE content_id IN (${placeholders})`,
      ids
    );
    // 平台版本连带它下面的镜像链接一起清掉，不留孤儿数据
    await execute(
      `DELETE FROM knav_download_mirrors
       WHERE download_id IN (SELECT id FROM knav_downloads WHERE content_id IN (${placeholders}))`,
      ids
    );
    await execute(
      `DELETE FROM knav_downloads WHERE content_id IN (${placeholders})`,
      ids
    );
    await refreshTagCounts();
    return { ok: true, affected: res.affectedRows };
  }

  if (op === "sticky" || op === "unstick") {
    const value = op === "sticky" ? 1 : 0;
    const res = await execute(
      `UPDATE knav_contents SET sticky = ? WHERE id IN (${placeholders})`,
      [value, ...ids]
    );
    return { ok: true, affected: res.affectedRows };
  }

  const status = op as ContentStatus;
  const res = await execute(
    `UPDATE knav_contents SET status = ? WHERE id IN (${placeholders})`,
    [status, ...ids]
  );
  return { ok: true, affected: res.affectedRows };
}

/**
 * 调整内容排序（相邻互换后整段重排）。
 *
 * 顺序口径与前台一致：置顶优先 → 排序值升序 → 发布时间倒序。
 * 移动后把整段内容的顺序值重排成 1,2,3…，
 * 否则相邻两项排序值相同时（线上绝大多数内容排序值都是 0）
 * 单纯交换数值看不出任何变化。
 *
 * 传入 categoryId 时只在该分类内部排序（不同分类的内容各排各的，
 * 前台分类页里的相对顺序互不干扰）。
 */
export async function moveContentOrder(
  id: number,
  direction: "up" | "down",
  categoryId?: number
): Promise<{ ok: boolean; error?: string }> {
  const scopeParams: any[] = [];
  let scope = "";
  if (categoryId && categoryId > 0) {
    scope = ` AND (c.category_id = ? OR EXISTS (
      SELECT 1 FROM knav_content_categories cc
       WHERE cc.content_id = c.id AND cc.category_id = ?))`;
    scopeParams.push(categoryId, categoryId);
  }

  const rows = await query<{ id: number }>(
    `SELECT c.id FROM knav_contents c
     WHERE c.type IN ('site','article','app') AND c.status <> 'trash'${scope}
     ORDER BY c.sticky DESC, c.sort_order ASC, c.created_at DESC, c.id DESC`,
    scopeParams
  );
  const ids = rows.map((r) => Number(r.id));
  const idx = ids.indexOf(id);
  if (idx < 0) return { ok: false, error: "内容不存在" };
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= ids.length) {
    return { ok: false, error: "已经在边界了" };
  }

  // 换位
  const [moved] = ids.splice(idx, 1);
  ids.splice(target, 0, moved);

  // 整段重排：顺序值 1..N，越小越靠前
  const placeholders = ids.map(() => "?").join(",");
  const cases = ids.map(() => "WHEN ? THEN ?").join(" ");
  const params: any[] = [];
  ids.forEach((cid, i) => params.push(cid, i + 1));
  await execute(
    `UPDATE knav_contents SET sort_order = CASE id ${cases} ELSE sort_order END
     WHERE id IN (${placeholders})`,
    [...params, ...ids]
  );
  return { ok: true };
}

/* ---------------------------------------------------------------- 分类 */

/** 调整分类排序（与同级相邻分类互换） */
export async function moveCategoryOrder(
  categoryId: number,
  direction: "up" | "down"
): Promise<{ ok: boolean; error?: string }> {
  const rows = await query<{ id: number; parent_id: number; sort_order: number }>(
    `SELECT id, parent_id, sort_order FROM knav_categories
     ORDER BY parent_id ASC, sort_order ASC, id ASC`
  );
  const list = rows as any[];
  const idx = list.findIndex((r) => Number(r.id) === categoryId);
  if (idx < 0) return { ok: false, error: "分类不存在" };
  const parent = Number(list[idx].parent_id) || 0;
  const siblings = list.filter((r) => (Number(r.parent_id) || 0) === parent);
  const sIdx = siblings.findIndex((r) => Number(r.id) === categoryId);
  const swapWith = direction === "up" ? sIdx - 1 : sIdx + 1;
  if (swapWith < 0 || swapWith >= siblings.length) {
    return { ok: false, error: "已经在边界了" };
  }
  const a = siblings[sIdx];
  const b = siblings[swapWith];
  await execute("UPDATE knav_categories SET sort_order = ? WHERE id = ?", [
    b.sort_order,
    a.id,
  ]);
  await execute("UPDATE knav_categories SET sort_order = ? WHERE id = ?", [
    a.sort_order,
    b.id,
  ]);
  return { ok: true };
}

/** 合并分类：把来源分类的内容移到目标分类，并删除来源 */
export async function mergeCategory(
  fromId: number,
  toId: number
): Promise<{ ok: boolean; moved?: number; error?: string }> {
  if (fromId === toId) return { ok: false, error: "不能合并到自身" };
  const dst = await queryOne<{ id: number }>(
    "SELECT id FROM knav_categories WHERE id = ? LIMIT 1",
    [toId]
  );
  const src = await queryOne<{ id: number }>(
    "SELECT id FROM knav_categories WHERE id = ? LIMIT 1",
    [fromId]
  );
  if (!src || !dst) return { ok: false, error: "分类不存在" };

  const moved = await transaction(async (conn) => {
    // 把「来源分类」的所有关联（含只作为多分类之一的）改挂到目标分类
    await conn.query(
      `INSERT IGNORE INTO knav_content_categories (content_id, category_id)
       SELECT content_id, ? FROM knav_content_categories WHERE category_id = ?`,
      [toId, fromId]
    );
    await conn.query(
      `INSERT IGNORE INTO knav_content_categories (content_id, category_id)
       SELECT id, ? FROM knav_contents WHERE category_id = ?`,
      [toId, fromId]
    );
    await conn.query(
      "DELETE FROM knav_content_categories WHERE category_id = ?",
      [fromId]
    );
    const [res] = await conn.query(
      "UPDATE knav_contents SET category_id = ? WHERE category_id = ?",
      [toId, fromId]
    );
    // 来源分类下的子分类一并挂到目标分类下
    await conn.query("UPDATE knav_categories SET parent_id = ? WHERE parent_id = ?", [
      toId,
      fromId,
    ]);
    await conn.query("DELETE FROM knav_categories WHERE id = ?", [fromId]);
    return (res as any).affectedRows as number;
  });
  return { ok: true, moved };
}

/* ---------------------------------------------------------------- 用户 */

/** 后台新增用户 */
export async function createManagedUser(input: {
  username: string;
  email: string;
  password: string;
  nickname?: string;
  role?: "user" | "editor" | "admin";
  status?: "pending" | "active" | "banned";
}): Promise<{ ok: boolean; id?: number; error?: string }> {  const username = input.username?.trim();
  const email = input.email?.trim().toLowerCase();
  if (!username) return { ok: false, error: "用户名不能为空" };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "邮箱格式不正确" };
  }
  if (!input.password || input.password.length < 8) {
    return { ok: false, error: "密码至少 8 位" };
  }
  const dup = await queryOne<{ id: number }>(
    "SELECT id FROM knav_users WHERE username = ? OR email = ? LIMIT 1",
    [username, email]
  );
  if (dup) return { ok: false, error: "用户名或邮箱已存在" };

  const hash = await bcrypt.hash(input.password, 12);
  const res = await execute(
    `INSERT INTO knav_users (username, email, password_hash, nickname, role, status, email_verified_at)
     VALUES (?,?,?,?,?,?,IF(? = 'active', NOW(), NULL))`,
    [
      username,
      email,
      hash,
      input.nickname?.trim() || username,
      input.role ?? "user",
      input.status ?? "active",
      input.status ?? "active",
    ]
  );
  return { ok: true, id: res.insertId };
}

/** 修改用户资料。actor 用来保护站长账号（其他人不能改站长） */
export async function updateManagedUser(
  id: number,
  input: {
    email?: string;
    nickname?: string;
    avatar?: string;
    bio?: string;
    role?: "user" | "editor" | "admin" | "owner";
    status?: "pending" | "active" | "banned";
  },
  actor: { id: number; role: string }
): Promise<{ ok: boolean; error?: string; emailChanged?: boolean }> {
  const target = await queryOne<{ role: string }>(
    "SELECT role FROM knav_users WHERE id = ? LIMIT 1",
    [id]
  );
  if (!target) return { ok: false, error: "用户不存在" };
  if (target.role === "owner") {
    if (actor.id !== id) {
      return { ok: false, error: "站长账号只能由站长本人修改" };
    }
    if (input.role !== undefined && input.role !== "owner") {
      return { ok: false, error: "站长身份不能直接降级，请使用「转移站长」" };
    }
    if (input.status !== undefined && input.status !== "active") {
      return { ok: false, error: "站长账号不能被封禁" };
    }
  }
  if (input.role === "owner" && target.role !== "owner") {
    return { ok: false, error: "请使用「转移站长」变更站长身份" };
  }

  const fields: string[] = [];
  const params: any[] = [];
  let emailChanged = false;
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { ok: false, error: "邮箱格式不正确" };
    }
    const dup = await queryOne<{ id: number }>(
      "SELECT id FROM knav_users WHERE email = ? AND id <> ? LIMIT 1",
      [email, id]
    );
    if (dup) return { ok: false, error: "该邮箱已被其它账号使用" };
    const current = await queryOne<{ email: string }>(
      "SELECT email FROM knav_users WHERE id = ? LIMIT 1",
      [id]
    );
    if (current && current.email.toLowerCase() !== email) emailChanged = true;
    fields.push("email = ?");
    params.push(email);
    if (emailChanged) {
      // 管理员替用户换邮箱，等于冒名改联系方式：新地址必须本人验证过才算数，
      // 清空验证时间后 loginUser 会直接拒绝登录，用户只能先走验证链接
      fields.push("email_verified_at = NULL");
    }
  }
  if (input.nickname !== undefined) {
    fields.push("nickname = ?");
    params.push(input.nickname.trim());
  }
  if (input.avatar !== undefined) {
    fields.push("avatar = ?");
    params.push(input.avatar.trim());
  }
  if (input.bio !== undefined) {
    fields.push("bio = ?");
    params.push(input.bio.trim());
  }
  if (input.role !== undefined) {
    fields.push("role = ?");
    params.push(input.role);
  }
  if (input.status !== undefined) {
    fields.push("status = ?");
    params.push(input.status);
  }
  if (fields.length === 0) return { ok: true };
  params.push(id);
  const res = await execute(
    `UPDATE knav_users SET ${fields.join(", ")} WHERE id = ?`,
    params
  );
  if (res.affectedRows === 0) return { ok: false, error: "用户不存在" };
  if (input.status === "banned") {
    await execute("DELETE FROM knav_sessions WHERE user_id = ?", [id]);
  }
  return { ok: true, emailChanged };
}

/** 重置用户密码 */
export async function resetUserPassword(
  id: number,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  if (!password || password.length < 8) {
    return { ok: false, error: "密码至少 8 位" };
  }
  const hash = await bcrypt.hash(password, 12);
  const res = await execute(
    "UPDATE knav_users SET password_hash = ? WHERE id = ?",
    [hash, id]
  );
  if (res.affectedRows === 0) return { ok: false, error: "用户不存在" };
  await execute("DELETE FROM knav_sessions WHERE user_id = ?", [id]);
  return { ok: true };
}

/** 删除用户（连带清理会话、收藏、通知、投稿）。站长账号不可删除 */
export async function deleteManagedUser(
  id: number
): Promise<{ ok: boolean; error?: string }> {
  const user = await queryOne<{ role: string; username: string }>(
    "SELECT role, username FROM knav_users WHERE id = ? LIMIT 1",
    [id]
  );
  if (!user) return { ok: false, error: "用户不存在" };
  if (user.role === "owner") {
    return { ok: false, error: "站长账号不能删除，请先把站长身份转移给别人" };
  }
  if (user.role === "admin") {
    // 允许删掉最后一个管理员（站长仍有全部后台权限），但不能连管理员和站长都删光
    const admins = await queryOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM knav_users WHERE role IN ('admin','owner') AND id <> ?",
      [id]
    );
    if (Number(admins?.n) === 0) {
      return { ok: false, error: "至少保留一个管理员账号" };
    }
  }
  await execute("DELETE FROM knav_sessions WHERE user_id = ?", [id]);
  await execute("DELETE FROM knav_user_identities WHERE user_id = ?", [id]);
  await execute("DELETE FROM knav_favorites WHERE user_id = ?", [id]);
  await execute("DELETE FROM knav_notifications WHERE user_id = ?", [id]);
  await execute("DELETE FROM knav_email_tokens WHERE user_id = ?", [id]);
  await execute("DELETE FROM knav_users WHERE id = ?", [id]);
  return { ok: true };
}

export interface UserActivity {
  notifications: number;
  unread: number;
  favorites: number;
}

/**
 * 批量取若干用户的通知数与收藏数（后台用户列表一次读一页，不做 N+1 查询）。
 * 没出现在结果里的用户就是 0 条，由调用方兜底。
 */
export async function getUserActivity(
  userIds: number[]
): Promise<Record<number, UserActivity>> {
  const out: Record<number, UserActivity> = {};
  if (userIds.length === 0) return out;
  const ph = userIds.map(() => "?").join(",");
  const empty = (): UserActivity => ({ notifications: 0, unread: 0, favorites: 0 });
  for (const id of userIds) out[id] = empty();

  const notices = await query<{ user_id: number; n: number; unread: number }>(
    `SELECT user_id, COUNT(*) AS n, SUM(is_read = 0) AS unread
     FROM knav_notifications WHERE user_id IN (${ph}) GROUP BY user_id`,
    userIds
  );
  for (const r of notices) {
    out[Number(r.user_id)] = {
      notifications: Number(r.n) || 0,
      unread: Number(r.unread) || 0,
      favorites: 0,
    };
  }

  const favs = await query<{ user_id: number; n: number }>(
    `SELECT user_id, COUNT(*) AS n FROM knav_favorites WHERE user_id IN (${ph}) GROUP BY user_id`,
    userIds
  );
  for (const r of favs) {
    const a = out[Number(r.user_id)] ?? empty();
    out[Number(r.user_id)] = { ...a, favorites: Number(r.n) || 0 };
  }
  return out;
}

/* --------------------------------------------------- 下载：平台版本 + 镜像链接 */

/**
 * 平台版本（knav_downloads）的写入参数。
 *
 * 一个软件可以挂多个平台版本，每个平台版本下再挂多个镜像下载链接
 * （官方下载 / 百度网盘 / 123网盘 / App Store / Google Play / App Gallery …）。
 */
export interface PlatformInput {
  /** 所属软件（knav_contents.id） */
  contentId?: number;
  /** 软件名称，留空则用内容标题 */
  resourceTitle?: string;
  platform?: string;
  /** 架构：x64 / x86 / ARM64 / universal …，留空表示不限 */
  arch?: string;
  version?: string;
  fileSize?: string;
  sha256?: string;
  preview?: string;
  note?: string;
  enabled?: boolean;
  sort?: number;
}

/** 新增平台版本 */
export async function createPlatform(
  input: PlatformInput
): Promise<{ ok: boolean; id?: number; error?: string }> {
  if (!input.contentId) return { ok: false, error: "缺少所属软件" };
  const res = await execute(
    `INSERT INTO knav_downloads
       (content_id, resource_title, platform, arch, version, file_size, sha256, preview, note, enabled, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      input.contentId,
      input.resourceTitle?.trim() ?? "",
      input.platform?.trim() || "通用",
      input.arch?.trim() ?? "",
      input.version?.trim() ?? "",
      input.fileSize?.trim() ?? "",
      input.sha256?.trim() ?? "",
      await localizeImage(input.preview?.trim() ?? ""),
      input.note?.trim() ?? "",
      input.enabled === false ? 0 : 1,
      input.sort ?? 0,
    ]
  );
  return { ok: true, id: res.insertId };
}

/** 修改平台版本 */
export async function updatePlatform(
  id: number,
  input: Partial<PlatformInput>
): Promise<{ ok: boolean; error?: string }> {
  const map: Record<string, string> = {
    contentId: "content_id",
    resourceTitle: "resource_title",
    platform: "platform",
    arch: "arch",
    version: "version",
    fileSize: "file_size",
    sha256: "sha256",
    preview: "preview",
    note: "note",
  };
  const fields: string[] = [];
  const params: any[] = [];
  for (const [key, column] of Object.entries(map)) {
    const v = (input as any)[key];
    if (v === undefined) continue;
    fields.push(`${column} = ?`);
    let val = typeof v === "string" ? v.trim() : v;
    if (column === "preview" && typeof val === "string") {
      val = await localizeImage(val);
    }
    if (column === "platform" && val === "") val = "通用";
    params.push(val);
  }
  if (input.enabled !== undefined) {
    fields.push("enabled = ?");
    params.push(input.enabled ? 1 : 0);
  }
  if (input.sort !== undefined) {
    fields.push("sort_order = ?");
    params.push(input.sort);
  }
  if (fields.length === 0) return { ok: true };
  params.push(id);
  const res = await execute(
    `UPDATE knav_downloads SET ${fields.join(", ")} WHERE id = ?`,
    params
  );
  if (res.affectedRows === 0) return { ok: false, error: "平台版本不存在" };
  return { ok: true };
}

/** 删除平台版本（连同它下面的镜像链接） */
export async function deletePlatform(id: number): Promise<{ ok: boolean; error?: string }> {
  await execute("DELETE FROM knav_download_mirrors WHERE download_id = ?", [id]);
  const res = await execute("DELETE FROM knav_downloads WHERE id = ?", [id]);
  if (res.affectedRows === 0) return { ok: false, error: "记录不存在" };
  return { ok: true };
}

/** 批量删除平台版本 */
export async function deletePlatforms(ids: number[]): Promise<{ ok: boolean; affected: number }> {
  if (ids.length === 0) return { ok: true, affected: 0 };
  const placeholders = ids.map(() => "?").join(",");
  await execute(`DELETE FROM knav_download_mirrors WHERE download_id IN (${placeholders})`, ids);
  const res = await execute(`DELETE FROM knav_downloads WHERE id IN (${placeholders})`, ids);
  return { ok: true, affected: res.affectedRows };
}

/** 批量开关平台版本 */
export async function togglePlatforms(
  ids: number[],
  enabled: boolean
): Promise<{ ok: boolean; affected: number }> {
  if (ids.length === 0) return { ok: true, affected: 0 };
  const placeholders = ids.map(() => "?").join(",");
  const res = await execute(
    `UPDATE knav_downloads SET enabled = ? WHERE id IN (${placeholders})`,
    [enabled ? 1 : 0, ...ids]
  );
  return { ok: true, affected: res.affectedRows };
}

/**
 * 改软件的显示名称。
 * resource_title 存在每条平台版本上，改一次要把这个软件的所有平台版本一起改掉，
 * 否则列表里同一个软件会出现两个名字。
 */
export async function setSoftwareTitle(
  contentId: number,
  title: string
): Promise<{ ok: boolean; affected: number }> {
  const res = await execute(
    "UPDATE knav_downloads SET resource_title = ? WHERE content_id = ?",
    [title.trim().slice(0, 200), contentId]
  );
  return { ok: true, affected: res.affectedRows };
}

/* ------------------------------------------------------------------ 软件 */

export interface SoftwareInput {
  /** 软件名称（必填）；linkContentId 有值时忽略，直接用那条内容的标题 */
  name: string;
  /**
   * 关联到已有内容（knav_contents.id）。
   * 留空 = 新建一条 app 类型内容；填了 = 给已有内容挂下载，不新建。
   */
  linkContentId?: number;
  categoryId?: number;
  description?: string;
  /** 软件主页 */
  url?: string;
  icon?: string;
  /** 首个平台版本（可全留空，之后在软件卡片里再加） */
  platform?: string;
  arch?: string;
  version?: string;
  fileSize?: string;
  mirrorName?: string;
  mirrorUrl?: string;
  mirrorNote?: string;
}

/**
 * 新增软件。
 *
 * 「软件」就是一条 app 类型的内容，所以下载管理里必须能直接建软件，
 * 不能只给一个「从已有内容里选」的下拉——那样永远加不了新软件。
 * 建完内容后顺带把首个平台版本和它的主镜像写进去，省得再点一轮。
 */
export async function createSoftware(
  input: SoftwareInput
): Promise<{ ok: true; contentId: number } | { ok: false; error: string }> {
  let contentId = Number(input.linkContentId) || 0;

  if (contentId > 0) {
    const row = await queryOne<{ id: number }>(
      "SELECT id FROM knav_contents WHERE id = ? LIMIT 1",
      [contentId]
    );
    if (!row) return { ok: false, error: "要关联的内容不存在" };
  } else {
    const name = input.name?.trim();
    if (!name) return { ok: false, error: "软件名称不能为空" };
    const created = await createContent({
      type: "app",
      title: name,
      url: input.url?.trim() ?? "",
      description: input.description?.trim() ?? "",
      categoryId: Number(input.categoryId) || undefined,
      icon: input.icon?.trim() ?? "",
      status: "publish",
    });
    if (!created.ok) return { ok: false, error: created.error };
    contentId = created.id;
  }

  // 首个平台版本：平台/架构/版本/地址全空就跳过，只建软件本身
  const platform = input.platform?.trim();
  const mirrorUrl = input.mirrorUrl?.trim();
  if (platform || input.version?.trim() || mirrorUrl) {
    const p = await createPlatform({
      contentId,
      platform: platform || "通用",
      arch: input.arch?.trim() ?? "",
      version: input.version?.trim() ?? "",
      fileSize: input.fileSize?.trim() ?? "",
      sort: 0,
    });
    if (!p.ok) return { ok: false, error: p.error ?? "软件已建好，但首个平台版本写入失败" };
    if (mirrorUrl && p.id) {
      const m = await createMirror({
        downloadId: p.id,
        name: input.mirrorName?.trim() || "官方下载",
        url: mirrorUrl,
        fileSize: input.fileSize?.trim() ?? "",
        note: input.mirrorNote?.trim() ?? "",
        sort: 0,
      });
      if (!m.ok) return { ok: false, error: m.error ?? "平台已建好，但主镜像写入失败" };
    }
  }

  return { ok: true, contentId };
}

/** 镜像链接（knav_download_mirrors）的写入参数 */
export interface MirrorInput {
  /** 所属平台版本（knav_downloads.id） */
  downloadId?: number;
  name: string;
  url: string;
  fileSize?: string;
  note?: string;
  enabled?: boolean;
  sort?: number;
}

/** 新增镜像链接 */
export async function createMirror(
  input: MirrorInput
): Promise<{ ok: boolean; id?: number; error?: string }> {
  if (!input.downloadId) return { ok: false, error: "请选择所属平台版本" };
  if (!input.name?.trim()) return { ok: false, error: "镜像名称不能为空" };
  if (!input.url?.trim()) return { ok: false, error: "下载地址不能为空" };
  const res = await execute(
    `INSERT INTO knav_download_mirrors
       (download_id, name, url, file_size, note, enabled, sort_order)
     VALUES (?,?,?,?,?,?,?)`,
    [
      input.downloadId,
      input.name.trim().slice(0, 100),
      input.url.trim().slice(0, 500),
      input.fileSize?.trim() ?? "",
      input.note?.trim() ?? "",
      input.enabled === false ? 0 : 1,
      input.sort ?? 0,
    ]
  );
  return { ok: true, id: res.insertId };
}

/** 修改镜像链接 */
export async function updateMirror(
  id: number,
  input: Partial<MirrorInput>
): Promise<{ ok: boolean; error?: string }> {
  const map: Record<string, string> = {
    downloadId: "download_id",
    name: "name",
    url: "url",
    fileSize: "file_size",
    note: "note",
  };
  const fields: string[] = [];
  const params: any[] = [];
  for (const [key, column] of Object.entries(map)) {
    const v = (input as any)[key];
    if (v === undefined) continue;
    if ((column === "name" || column === "url") && !String(v).trim()) {
      return { ok: false, error: column === "name" ? "镜像名称不能为空" : "下载地址不能为空" };
    }
    fields.push(`${column} = ?`);
    params.push(typeof v === "string" ? v.trim() : v);
  }
  if (input.enabled !== undefined) {
    fields.push("enabled = ?");
    params.push(input.enabled ? 1 : 0);
  }
  if (input.sort !== undefined) {
    fields.push("sort_order = ?");
    params.push(input.sort);
  }
  if (fields.length === 0) return { ok: true };
  params.push(id);
  const res = await execute(
    `UPDATE knav_download_mirrors SET ${fields.join(", ")} WHERE id = ?`,
    params
  );
  if (res.affectedRows === 0) return { ok: false, error: "镜像不存在" };
  return { ok: true };
}

/** 删除镜像链接 */
export async function deleteMirror(id: number): Promise<{ ok: boolean; error?: string }> {
  const res = await execute("DELETE FROM knav_download_mirrors WHERE id = ?", [id]);
  if (res.affectedRows === 0) return { ok: false, error: "记录不存在" };
  return { ok: true };
}

/** 批量开关镜像链接 */
export async function toggleMirrors(
  ids: number[],
  enabled: boolean
): Promise<{ ok: boolean; affected: number }> {
  if (ids.length === 0) return { ok: true, affected: 0 };
  const placeholders = ids.map(() => "?").join(",");
  const res = await execute(
    `UPDATE knav_download_mirrors SET enabled = ? WHERE id IN (${placeholders})`,
    [enabled ? 1 : 0, ...ids]
  );
  return { ok: true, affected: res.affectedRows };
}
