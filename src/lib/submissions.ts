// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  // 仅在 Next.js 运行时启用守卫；独立脚本(tsx)下允许直接导入
  require("server-only");
}
import { query, queryOne, execute, transaction } from "./db";
import { notify } from "./auth";
import { sendReviewResultMail } from "./mail";
import { renderMarkdownSync, sanitizeHtml, excerptFromMarkdown, looksLikeHtml, enhanceCodeBlocks, enhanceImages } from "./markdown";
import { getCodeConfig } from "./settings";
import { localizeImage, localizeContentImages } from "./media";
import { saveContentShortlink } from "./shortlink";

export { sanitizeHtml, excerptFromMarkdown };

/**
 * 投稿与审核。
 *
 * 投稿先落在 knav_submissions（status=pending），
 * 审核通过后才写入 knav_contents，成为前台可见的正式内容。
 * 这样前台读到的永远是已发布内容，审核队列独立可控。
 */

export type SubmissionType = "site" | "article";
export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface Submission {
  id: number;
  userId: number;
  username: string;
  type: SubmissionType;
  title: string;
  url: string;
  description: string;
  contentMd: string;
  cover: string;
  categoryId: number;
  categoryName: string;
  tags: string;
  status: SubmissionStatus;
  reviewNote: string;
  reviewerId: number | null;
  reviewerName: string;
  reviewedAt: string | null;
  publishedId: number | null;
  createdAt: string;
}

export interface SubmissionInput {
  type: SubmissionType;
  title: string;
  url?: string;
  description?: string;
  contentMd?: string;
  cover?: string;
  categoryId: number;
  tags?: string;
}

export async function createSubmission(
  userId: number,
  input: SubmissionInput
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "标题不能为空" };
  if (title.length > 200) return { ok: false, error: "标题过长" };

  if (input.type === "site") {
    const url = input.url?.trim();
    if (!url) return { ok: false, error: "网址不能为空" };
    if (!/^https?:\/\/.+/i.test(url)) return { ok: false, error: "网址必须以 http:// 或 https:// 开头" };
  } else {
    if (!input.contentMd?.trim()) return { ok: false, error: "文章正文不能为空" };
  }

  if (!input.categoryId) return { ok: false, error: "请选择分类" };

  // 投稿只能归入已有分类（新建分类是管理员的权限），这里确认 id 真的存在，
  // 免得前端被绕过写进一条挂空的投稿
  const category = await queryOne<{ id: number }>(
    "SELECT id FROM knav_categories WHERE id = ?",
    [input.categoryId]
  );
  if (!category) return { ok: false, error: "所选分类不存在，请重新选择" };

  const { insertId } = await execute(
    `INSERT INTO knav_submissions
       (user_id, type, title, url, description, content_md, cover, category_id, tags, status)
     VALUES (?,?,?,?,?,?,?,?,?, 'pending')`,
    [
      userId,
      input.type,
      title,
      input.url?.trim() ?? "",
      input.description?.trim() ?? "",
      input.contentMd ?? "",
      input.cover?.trim() ?? "",
      input.categoryId,
      input.tags?.trim() ?? "",
    ]
  );

  await notify(
    userId,
    "submit",
    "投稿已提交",
    `你提交的《${title}》已进入审核队列，审核结果会通过邮件通知你。`,
    "/dashboard/submissions"
  );
  return { ok: true, id: insertId };
}

/** 读取投稿详情 */
export async function getSubmission(id: number): Promise<Submission | null> {
  const rows = await query<any>(
    `SELECT s.*, u.username,
            c.name AS category_name,
            COALESCE(r.username, '') AS reviewer_name
     FROM knav_submissions s
     JOIN knav_users u ON u.id = s.user_id
     LEFT JOIN knav_categories c ON c.id = s.category_id
     LEFT JOIN knav_users r ON r.id = s.reviewer_id
     WHERE s.id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? mapSubmission(rows[0]) : null;
}

/** 列表查询 */
export async function listSubmissions(opts: {
  userId?: number;
  status?: SubmissionStatus;
  type?: SubmissionType;
  limit?: number;
  offset?: number;
}): Promise<{ items: Submission[]; total: number }> {
  const { userId, status, type, limit = 20, offset = 0 } = opts;
  const where: string[] = ["1=1"];
  const params: any[] = [];
  if (userId) {
    where.push("s.user_id = ?");
    params.push(userId);
  }
  if (status) {
    where.push("s.status = ?");
    params.push(status);
  }
  if (type) {
    where.push("s.type = ?");
    params.push(type);
  }
  const clause = where.join(" AND ");

  const totalRow = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM knav_submissions s WHERE ${clause}`,
    params
  );
  const rows = await query<any>(
    `SELECT s.*, u.username,
            c.name AS category_name,
            COALESCE(r.username, '') AS reviewer_name
     FROM knav_submissions s
     JOIN knav_users u ON u.id = s.user_id
     LEFT JOIN knav_categories c ON c.id = s.category_id
     LEFT JOIN knav_users r ON r.id = s.reviewer_id
     WHERE ${clause}
     ORDER BY s.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { items: rows.map(mapSubmission), total: Number(totalRow?.n) || 0 };
}

/** 统计某用户的投稿数量（按状态） */
export async function countSubmissionsByStatus(
  userId: number
): Promise<{ pending: number; approved: number; rejected: number; total: number }> {
  const row = await queryOne<any>(
    `SELECT
       SUM(status = 'pending')  AS pending,
       SUM(status = 'approved') AS approved,
       SUM(status = 'rejected') AS rejected,
       COUNT(*)                 AS total
     FROM knav_submissions WHERE user_id = ?`,
    [userId]
  );
  return {
    pending: Number(row?.pending) || 0,
    approved: Number(row?.approved) || 0,
    rejected: Number(row?.rejected) || 0,
    total: Number(row?.total) || 0,
  };
}

function mapSubmission(r: any): Submission {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    type: r.type,
    title: r.title,
    url: r.url,
    description: r.description,
    contentMd: r.content_md,
    cover: r.cover,
    categoryId: r.category_id,
    categoryName: r.category_name ?? "",
    tags: r.tags,
    status: r.status,
    reviewNote: r.review_note,
    reviewerId: r.reviewer_id,
    reviewerName: r.reviewer_name ?? "",
    reviewedAt: r.reviewed_at,
    publishedId: r.published_id,
    createdAt: r.created_at,
  };
}

/**
 * 审核：通过则写入 knav_contents 并发布；驳回则仅记录原因。
 */
export async function reviewSubmission(
  submissionId: number,
  reviewerId: number,
  approved: boolean,
  note: string
): Promise<{ ok: boolean; error?: string; contentId?: number }> {
  const sub = await getSubmission(submissionId);
  if (!sub) return { ok: false, error: "投稿不存在" };
  if (sub.status !== "pending") return { ok: false, error: "该投稿已审核过" };

  let contentId: number | undefined;

  if (approved) {
    const created = await publishSubmission(sub);
    if (!created.ok) return { ok: false, error: created.error };
    contentId = created.contentId;
    // 和后台直接保存网址一样，审核通过时顺手生成直达短链
    await saveContentShortlink(contentId);
  }

  await execute(
    `UPDATE knav_submissions
     SET status = ?, review_note = ?, reviewer_id = ?, reviewed_at = NOW(), published_id = ?
     WHERE id = ?`,
    [approved ? "approved" : "rejected", note ?? "", reviewerId, contentId ?? null, submissionId]
  );

  // 通知用户：站内 + 邮件
  const publishedLink =
    approved && contentId
      ? sub.type === "site"
        ? `/sites/${contentId}.html`
        : `/${contentId}.html`
      : "/dashboard/submissions";

  await notify(
    sub.userId,
    "review",
    approved ? "投稿已通过审核" : "投稿未通过审核",
    approved
      ? `《${sub.title}》已通过审核并发布。${note ? `审核意见：${note}` : ""}`
      : `《${sub.title}》未通过审核。${note ? `原因：${note}` : "内容不符合收录要求"}`,
    publishedLink
  );

  const userRow = await queryOne<{ username: string; email: string }>(
    "SELECT username, email FROM knav_users WHERE id = ? LIMIT 1",
    [sub.userId]
  );
  if (userRow) {
    await sendReviewResultMail(
      userRow.email,
      userRow.username,
      sub.title,
      approved,
      note ?? ""
    );
  }

  return { ok: true, contentId };
}

/** 把通过的投稿写入 knav_contents */
async function publishSubmission(
  sub: Submission
): Promise<{ ok: true; contentId: number } | { ok: false; error: string }> {
  const type = sub.type === "site" ? "site" : "article";
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  // 外链图片本地化：封面与正文里的远程图片都抓到本地
  const cover = await localizeImage(sub.cover ?? "");
  const body =
    sub.type === "article" ? await localizeContentImages(sub.contentMd ?? "") : "";

  return transaction(async (conn) => {
    const [res] = await conn.query(
      `INSERT INTO knav_contents
         (type, title, slug, url, description, content_md, icon, cover,
          category_id, views, likes, sticky, sort_order, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,0,0,0,0,'publish',?,?)`,
      [
        type,
        sub.title,
        slugify(sub.title),
        sub.url ?? "",
        sub.description ?? "",
        body,
        cover,
        cover,
        sub.categoryId,
        now,
        now,
      ]
    );
    const contentId = (res as any).insertId as number;

    // 投稿只选一个分类，审核通过后写一条关联记录
    if (sub.categoryId > 0) {
      await conn.query(
        "INSERT IGNORE INTO knav_content_categories (content_id, category_id) VALUES (?,?)",
        [contentId, sub.categoryId]
      );
    }

    // 关联标签：先按名称复用已有标签，再按别名，最后才新建
    // （直接用 slug 匹配会把中文标签重复建成两份）
    const tagNames = (sub.tags || "")
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10);
    for (const name of tagNames) {
      const slug = slugify(name);
      const [existing] = await conn.query(
        `SELECT id FROM knav_tags WHERE name = ? OR slug = ?
         ORDER BY (name = ?) DESC LIMIT 1`,
        [name, slug, name]
      );
      let tagId: number;
      if ((existing as any[]).length > 0) {
        tagId = (existing as any[])[0].id;
      } else {
        // 别名冲突时补一个后缀，避免与已有标签撞 slug
        let finalSlug = slug;
        const [dup] = await conn.query(
          "SELECT id FROM knav_tags WHERE slug = ? LIMIT 1",
          [finalSlug]
        );
        if ((dup as any[]).length > 0) finalSlug = `${slug}-${Date.now().toString(36)}`;

        const [ins] = await conn.query(
          "INSERT INTO knav_tags (name, slug) VALUES (?,?)",
          [name, finalSlug]
        );
        tagId = (ins as any).insertId as number;
      }
      await conn.query(
        "INSERT IGNORE INTO knav_content_tags (content_id, tag_id) VALUES (?,?)",
        [contentId, tagId]
      );
    }

    return { ok: true as const, contentId };
  });
}

/** 撤回投稿（作者本人，未审核时可撤回） */
export async function withdrawSubmission(
  submissionId: number,
  userId: number
): Promise<{ ok: boolean; error?: string }> {
  const sub = await getSubmission(submissionId);
  if (!sub) return { ok: false, error: "投稿不存在" };
  if (sub.userId !== userId) return { ok: false, error: "无权操作" };
  if (sub.status !== "pending") return { ok: false, error: "已审核的投稿无法撤回" };
  await execute("DELETE FROM knav_submissions WHERE id = ?", [submissionId]);
  return { ok: true };
}

/** slug 化 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

/**
 * Markdown 渲染。
 * 使用 marked 解析，并对生成的 HTML 做安全过滤，防止 XSS。
 *
 * 老站 OneNav 的文章正文是可视化编辑器存下来的 HTML，这类内容直接做安全过滤即可，
 * 再交给 Markdown 解析器会把结构弄乱（标题被吞、代码块错位）。
 *
 * 渲染完统一套一层代码块增强（语言标签 + 复制按钮），
 * 语言标签与复制按钮是否显示由后台「代码块」设置控制。
 */
export async function renderMarkdown(md: string): Promise<string> {
  const html = looksLikeHtml(md) ? sanitizeHtml(md) : renderMarkdownSync(md);
  const cfg = await getCodeConfig();
  return enhanceCodeBlocks(enhanceImages(html), {
    showCopy: cfg.showCopy,
    showLang: cfg.showLang,
  });
}
