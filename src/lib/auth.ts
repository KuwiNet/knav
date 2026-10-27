// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  // 仅在 Next.js 运行时启用守卫；独立脚本(tsx)下允许直接导入
  require("server-only");
}
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { query, queryOne, execute } from "./db";
import {
  sendVerifyEmail,
  sendResetPasswordEmail,
  sendAdminResetPasswordEmail,
  sendSiteResetCodeEmail,
} from "./mail";

/**
 * 认证模块：注册、邮箱验证、登录、会话、找回密码。
 *
 * 密码使用 bcrypt 散列；会话 token 只存 sha256 摘要（数据库泄露也无法直接冒用）。
 * 注册后状态为 pending，邮箱验证通过后才可登录与投稿。
 */

export const SESSION_COOKIE = "kw_session";
const SESSION_TTL_DAYS = 30;
const VERIFY_TTL_HOURS = 24;
const RESET_TTL_HOURS = 1;

export interface User {
  id: number;
  username: string;
  email: string;
  nickname: string;
  avatar: string;
  bio: string;
  role: "user" | "editor" | "admin" | "owner";
  status: "pending" | "active" | "banned";
  emailVerified: boolean;
  /** 是否设置过密码（纯第三方注册的账号初始没有密码） */
  hasPassword: boolean;
  createdAt: string;
  /** 最近登录时间 */
  lastLoginAt: string;
}

interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  nickname: string;
  avatar: string;
  bio: string;
  role: "user" | "editor" | "admin" | "owner";
  status: "pending" | "active" | "banned";
  email_verified_at: string | null;
  created_at: string;
  last_login_at: string | null;
}

function toUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    nickname: r.nickname || r.username,
    avatar: r.avatar,
    bio: r.bio,
    role: r.role,
    status: r.status,
    emailVerified: r.email_verified_at != null,
    hasPassword: Boolean(r.password_hash),
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at ?? "",
  };
}

/** 密码强度校验 */
export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "密码至少 8 位";
  if (pw.length > 72) return "密码不能超过 72 位";
  if (!/[a-zA-Z]/.test(pw)) return "密码需包含字母";
  if (!/[0-9]/.test(pw)) return "密码需包含数字";
  return null;
}

export function validateUsername(name: string): string | null {
  if (name.length < 3) return "用户名至少 3 位";
  if (name.length > 30) return "用户名最多 30 位";
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return "用户名只能包含字母、数字和下划线";
  return null;
}

export function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "邮箱格式不正确";
  if (email.length > 190) return "邮箱过长";
  return null;
}

/**
 * 注册：创建用户 + 生成验证令牌 + 发送验证邮件。
 * 返回结果中不回传密码。
 */
export async function registerUser(
  username: string,
  email: string,
  password: string
): Promise<
  | { ok: true; user: User }
  | { ok: false; error: string }
> {
  const uErr = validateUsername(username);
  if (uErr) return { ok: false, error: uErr };
  const eErr = validateEmail(email);
  if (eErr) return { ok: false, error: eErr };
  const pErr = validatePassword(password);
  if (pErr) return { ok: false, error: pErr };

  const exists = await queryOne<{ id: number }>(
    "SELECT id FROM knav_users WHERE username = ? OR email = ? LIMIT 1",
    [username, email]
  );
  if (exists) return { ok: false, error: "用户名或邮箱已被注册" };

  const hash = await bcrypt.hash(password, 12);
  const { insertId } = await execute(
    "INSERT INTO knav_users (username, email, password_hash, nickname, role, status) VALUES (?,?,?,?,'user','pending')",
    [username, email, hash, username]
  );

  const token = crypto.randomBytes(32).toString("hex");
  await createToken(insertId, email, "verify", token, VERIFY_TTL_HOURS);

  const user = await getUserById(insertId);
  if (!user) return { ok: false, error: "用户创建失败" };

  // 发信失败不阻断注册，用户可在登录页重发
  const mail = await sendVerifyEmail(email, username, token);
  if (!mail.ok) {
    console.error("[auth] 验证邮件发送失败:", mail.error);
  }

  return { ok: true, user };
}

/** 创建邮件令牌（只存摘要） */
async function createToken(
  userId: number,
  email: string,
  purpose: "verify" | "reset_password" | "change_email" | "site_reset",
  plainToken: string,
  ttlHours: number
): Promise<void> {
  const hash = sha256(plainToken);
  // 过期时间交给数据库算：进程时区与 MySQL 时区不一定一致，
  // 用 JS 生成 UTC 字符串再跟 NOW() 比会整体偏掉几个小时
  await execute(
    "INSERT INTO knav_email_tokens (user_id, email, purpose, token_hash, expires_at) VALUES (?,?,?,?, NOW() + INTERVAL ? MINUTE)",
    [userId, email, purpose, hash, Math.max(1, Math.round(ttlHours * 60))]
  );
}

/** 校验并消费令牌 */
async function consumeToken(
  token: string,
  purpose: "verify" | "reset_password"
): Promise<{ userId: number; email: string } | null> {
  const hash = sha256(token);
  const row = await queryOne<{ id: number; user_id: number; email: string }>(
    `SELECT id, user_id, email FROM knav_email_tokens
     WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [hash, purpose]
  );
  if (!row) return null;
  await execute("UPDATE knav_email_tokens SET used_at = NOW() WHERE id = ?", [row.id]);
  return { userId: row.user_id, email: row.email };
}

/** 验证邮箱 */
export async function verifyEmail(token: string): Promise<{ ok: boolean; error?: string }> {
  const found = await consumeToken(token, "verify");
  if (!found) return { ok: false, error: "验证链接无效或已过期" };

  await execute(
    "UPDATE knav_users SET status = 'active', email_verified_at = NOW() WHERE id = ?",
    [found.userId]
  );
  await execute(
    "INSERT INTO knav_notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)",
    [
      found.userId,
      "verify",
      "邮箱验证成功",
      "你的邮箱已验证，现在可以投稿、收藏并接收审核通知。",
      "/dashboard",
    ]
  );
  return { ok: true };
}

/** 重发验证邮件 */
export async function resendVerifyEmail(
  userId: number
): Promise<{ ok: boolean; error?: string }> {
  const row = await queryOne<UserRow>("SELECT * FROM knav_users WHERE id = ? LIMIT 1", [userId]);
  if (!row) return { ok: false, error: "用户不存在" };
  if (row.email_verified_at) return { ok: false, error: "邮箱已验证，无需重发" };

  const token = crypto.randomBytes(32).toString("hex");
  await createToken(row.id, row.email, "verify", token, VERIFY_TTL_HOURS);
  const mail = await sendVerifyEmail(row.email, row.username, token);
  return mail.ok ? { ok: true } : { ok: false, error: mail.error ?? "邮件发送失败" };
}

/** 登录 */
export async function loginUser(
  identifier: string,
  password: string
): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const row = await queryOne<UserRow>(
    "SELECT * FROM knav_users WHERE username = ? OR email = ? LIMIT 1",
    [identifier, identifier]
  );
  // 无论用户是否存在都做一次哈希比对，避免通过响应时间区分用户是否存在
  const hash = row?.password_hash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
  const ok = await bcrypt.compare(password, hash);
  if (!row || !ok) return { ok: false, error: "用户名或密码错误" };
  if (row.status === "banned") return { ok: false, error: "账号已被封禁" };
  if (row.status === "pending" || !row.email_verified_at) {
    return { ok: false, error: "邮箱尚未验证，请先查收验证邮件" };
  }

  await execute(
    "UPDATE knav_users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = ?",
    [row.id]
  );
  return { ok: true, user: toUser(row) };
}

/**
 * 生产模式不等于一定走 HTTPS：直连 3000 端口调试时若强制 Secure，
 * 浏览器会静默丢弃会话 Cookie，表现就是登录后又被弹回登录页。
 */
async function requestIsHttps(req?: Request): Promise<boolean> {
  const forwarded =
    req?.headers.get("x-forwarded-proto") ??
    (await headers()).get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  if (req) return new URL(req.url).protocol === "https:";
  return false;
}

/** 创建会话并写入 Cookie */
export async function createSession(userId: number, req?: Request): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const id = sha256(token);
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86400 * 1000);

  const ip =
    req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req?.headers.get("x-real-ip") ||
    "";
  const ua = (req?.headers.get("user-agent") || "").slice(0, 500);

  await execute(
    "INSERT INTO knav_sessions (id, user_id, expires_at, ip, user_agent) VALUES (?,?, NOW() + INTERVAL ? DAY, ?, ?)",
    [id, userId, SESSION_TTL_DAYS, ip, ua]
  );

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await requestIsHttps(req),
    path: "/",
    expires,
  });
}

/** 销毁会话 */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await execute("DELETE FROM knav_sessions WHERE id = ?", [sha256(token)]);
  }
  jar.delete(SESSION_COOKIE);
}

/** 读取当前登录用户 */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<UserRow>(
    `SELECT u.* FROM knav_sessions s
     JOIN knav_users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > NOW() AND u.status = 'active'
     LIMIT 1`,
    [sha256(token)]
  );
  return row ? toUser(row) : null;
}

/** 清理过期会话 */
export async function cleanupSessions(): Promise<void> {
  await execute("DELETE FROM knav_sessions WHERE expires_at < NOW()");
}

export async function getUserById(id: number): Promise<User | null> {
  const row = await queryOne<UserRow>("SELECT * FROM knav_users WHERE id = ? LIMIT 1", [id]);
  return row ? toUser(row) : null;
}

/** 发起找回密码 */
export async function requestPasswordReset(
  identifier: string
): Promise<{ ok: boolean; error?: string; sentTo?: string }> {
  const row = await queryOne<UserRow>(
    "SELECT * FROM knav_users WHERE (username = ? OR email = ?) AND status != 'banned' LIMIT 1",
    [identifier, identifier]
  );
  // 无论用户是否存在都返回成功，避免账号枚举
  if (!row) return { ok: true };

  const token = crypto.randomBytes(32).toString("hex");
  await createToken(row.id, row.email, "reset_password", token, RESET_TTL_HOURS);
  const mail = await sendResetPasswordEmail(row.email, row.username, token);
  if (!mail.ok) return { ok: false, error: mail.error ?? "邮件发送失败" };
  return { ok: true, sentTo: row.email };
}

/**
 * 管理员重置密码后，给用户发「设置新密码」链接。
 *
 * 管理员填了临时密码时，邮件里同时给出临时密码与一次性链接，用户可二选一；
 * 没填就只发链接，让用户自己设。
 * 令牌给 24 小时，比用户自助找回密码的 1 小时宽——管理员没法替用户催邮件。
 */
export async function sendAdminPasswordResetLink(
  userId: number,
  temporaryPassword?: string
): Promise<{ ok: boolean; error?: string }> {
  const row = await queryOne<UserRow>(
    "SELECT * FROM knav_users WHERE id = ? LIMIT 1",
    [userId]
  );
  if (!row) return { ok: false, error: "用户不存在" };

  const token = crypto.randomBytes(32).toString("hex");
  await createToken(row.id, row.email, "reset_password", token, 24);

  const mail = await sendAdminResetPasswordEmail(
    row.email,
    row.username,
    token,
    temporaryPassword
  );
  await notify(
    userId,
    "admin",
    "管理员已重置你的密码",
    temporaryPassword
      ? "管理员已为你设置临时密码，请查收邮件并用临时密码登录，或使用邮件里的「设置新密码」链接自行重设（24 小时内有效，只能用一次）。"
      : "管理员为你生成了「设置新密码」链接，请查收邮件（24 小时内有效，只能用一次）。邮件没收到的话可以在登录页走「忘记密码」。",
    "/login"
  );
  if (!mail.ok) return { ok: false, error: mail.error ?? "邮件发送失败" };
  return { ok: true };
}

/** 站点重置验证码有效期（分钟） */
export const SITE_RESET_CODE_TTL_MINUTES = 10;

/** 站长执行站点重置前，往站长邮箱发一次性验证码 */
export async function sendSiteResetCode(
  userId: number
): Promise<{ ok: boolean; error?: string }> {
  const row = await queryOne<UserRow>(
    "SELECT * FROM knav_users WHERE id = ? AND role = 'owner' LIMIT 1",
    [userId]
  );
  if (!row) return { ok: false, error: "只有站长可以执行站点重置" };
  if (!row.email_verified_at) {
    return { ok: false, error: "站长邮箱还没有验证过，请先在账号设置里完成邮箱验证" };
  }

  // 每次只保留最新一条，旧验证码立即失效
  await execute(
    "DELETE FROM knav_email_tokens WHERE user_id = ? AND purpose = 'site_reset'",
    [userId]
  );
  const code = String(crypto.randomInt(100000, 1000000));
  await createToken(
    row.id,
    row.email,
    "site_reset",
    code,
    SITE_RESET_CODE_TTL_MINUTES / 60
  );

  const mail = await sendSiteResetCodeEmail(
    row.email,
    row.username,
    code,
    SITE_RESET_CODE_TTL_MINUTES
  );
  if (!mail.ok) return { ok: false, error: mail.error ?? "验证码邮件发送失败" };
  return { ok: true };
}

/** 校验站长重置验证码；输错一次就作废，避免穷举 */
export async function consumeSiteResetCode(
  userId: number,
  code: string
): Promise<boolean> {
  const hash = sha256(code.trim());
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM knav_email_tokens
     WHERE user_id = ? AND purpose = 'site_reset' AND token_hash = ?
       AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [userId, hash]
  );
  if (!row) {
    await execute(
      "DELETE FROM knav_email_tokens WHERE user_id = ? AND purpose = 'site_reset'",
      [userId]
    );
    return false;
  }
  await execute("UPDATE knav_email_tokens SET used_at = NOW() WHERE id = ?", [row.id]);
  return true;
}

/** 用令牌重置密码 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const pErr = validatePassword(newPassword);
  if (pErr) return { ok: false, error: pErr };

  const found = await consumeToken(token, "reset_password");
  if (!found) return { ok: false, error: "重置链接无效或已过期" };

  const hash = await bcrypt.hash(newPassword, 12);
  await execute("UPDATE knav_users SET password_hash = ? WHERE id = ?", [hash, found.userId]);
  // 重置密码后使该用户所有会话失效
  await execute("DELETE FROM knav_sessions WHERE user_id = ?", [found.userId]);
  return { ok: true };
}

/** 修改密码（需已登录） */
export async function changePassword(
  userId: number,
  oldPassword: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const pErr = validatePassword(newPassword);
  if (pErr) return { ok: false, error: pErr };

  const row = await queryOne<UserRow>("SELECT * FROM knav_users WHERE id = ? LIMIT 1", [userId]);
  if (!row) return { ok: false, error: "用户不存在" };
  // 纯第三方注册的账号还没有密码，首次设置时无需校验原密码
  if (row.password_hash && !(await bcrypt.compare(oldPassword, row.password_hash))) {
    return { ok: false, error: "原密码不正确" };
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await execute("UPDATE knav_users SET password_hash = ? WHERE id = ?", [hash, userId]);
  return { ok: true };
}

/** 清理过期的邮件令牌 */
export async function cleanupTokens(): Promise<void> {
  await execute("DELETE FROM knav_email_tokens WHERE expires_at < NOW() - INTERVAL 7 DAY");
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** 是否管理员（含站长） */
export function isAdmin(user: User | null): boolean {
  return (
    !!user &&
    (user.role === "admin" || user.role === "editor" || user.role === "owner")
  );
}

/** 是否站长（唯一，拥有站点重置等最高权限） */
export function isOwner(user: User | null): boolean {
  return !!user && user.role === "owner";
}

/** 读取用户列表（后台用） */
export async function listUsers(
  opts: { keyword?: string; status?: string; limit?: number; offset?: number } = {}
): Promise<{ users: User[]; total: number }> {
  const { keyword, status, limit = 20, offset = 0 } = opts;
  const where: string[] = ["1=1"];
  const params: any[] = [];
  if (keyword) {
    where.push("(username LIKE ? OR email LIKE ? OR nickname LIKE ?)");
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  const clause = where.join(" AND ");

  const totalRow = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM knav_users WHERE ${clause}`,
    params
  );
  const rows = await query<UserRow>(
    `SELECT * FROM knav_users WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return { users: rows.map(toUser), total: Number(totalRow?.n) || 0 };
}

/** 写入站内通知 */
export async function notify(
  userId: number,
  type: string,
  title: string,
  body: string,
  link = ""
): Promise<void> {
  await execute(
    "INSERT INTO knav_notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)",
    [userId, type, title, body, link]
  );
}

/** 读取通知列表 */
export async function listNotifications(
  userId: number,
  limit = 50
): Promise<{ id: number; type: string; title: string; body: string; link: string; isRead: boolean; createdAt: string }[]> {
  const rows = await query<any>(
    "SELECT id, type, title, body, link, is_read, created_at FROM knav_notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?",
    [userId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    isRead: !!r.is_read,
    createdAt: r.created_at,
  }));
}

/** 未读通知数 */
export async function unreadCount(userId: number): Promise<number> {
  const row = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM knav_notifications WHERE user_id = ? AND is_read = 0",
    [userId]
  );
  return Number(row?.n) || 0;
}

/** 通知总数（用户概览卡片用） */
export async function notificationCount(userId: number): Promise<number> {
  const row = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM knav_notifications WHERE user_id = ?",
    [userId]
  );
  return Number(row?.n) || 0;
}
