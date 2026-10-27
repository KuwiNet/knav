import crypto from "node:crypto";
import { query, queryOne, execute, transaction } from "./db";
import { getSetting } from "./settings";
import { resendVerifyEmail, validateEmail, validateUsername } from "./auth";

/**
 * 第三方登录与账号绑定。
 *
 * 支持四种（后台「站点设置 → 登录方式」里分别开关并配置）：
 *   - Telegram：官方登录组件 → 服务端校验签名 → 登录或绑定
 *   - GitHub / Gitee / Google：OAuth2 授权码流程 → 换 token → 取用户信息
 *
 * 绑定关系存在 knav_user_identities，一个用户可绑多个平台。
 * 未绑定过的第三方账号不会静默建号：先签发一次性票据，由用户选择
 * 「绑定已有账号」或「新建账号（邮箱需验证）」。
 */

export type Provider = "telegram" | "github" | "gitee" | "google";

/** 授权码模式的来源（都要配 Client ID / Secret） */
export type OAuthProvider = "github" | "gitee" | "google";

export const PROVIDER_LABEL: Record<Provider, string> = {
  telegram: "Telegram",
  github: "GitHub",
  gitee: "Gitee",
  google: "Google",
};

export interface SocialProfile {
  provider: Provider;
  /** 来源侧唯一 ID */
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  email: string;
  /** 来源侧是否已验证邮箱 */
  emailVerified: boolean;
}

/* ---------------------------------------------------------------- Telegram */

/**
 * 校验 Telegram 登录组件回传的数据。
 *
 * 官方算法：secret_key = SHA256(bot_token)，
 * data_check_string = "auth_date=<>\nfirst_name=<>\nid=<>\nusername=<>"（按 key 排序、排除 hash），
 * 计算 HMAC-SHA256(secret_key, data_check_string) 与 hash 比对。
 */
export function verifyTelegramAuth(
  payload: Record<string, string>,
  botToken: string
): boolean {
  const hash = payload.hash;
  if (!hash) return false;

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const check = Object.keys(payload)
    .filter((k) => k !== "hash" && payload[k] !== undefined)
    .sort()
    .map((k) => `${k}=${payload[k]}`)
    .join("\n");

  const calc = crypto
    .createHmac("sha256", secretKey)
    .update(check)
    .digest("hex");

  return calc === hash;
}

/* ---------------------------------------------------------------- GitHub */

/** 用授权码换取 access_token */
export async function exchangeGithubCode(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });
    const data = (await res.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!data.access_token) {
      return {
        ok: false,
        error: data.error_description || data.error || "获取令牌失败",
      };
    }
    return { ok: true, token: data.access_token };
  } catch (e) {
    return { ok: false, error: `请求 GitHub 失败：${(e as Error).message}` };
  }
}

/** 用 access_token 取用户信息 */
export async function fetchGithubProfile(
  token: string
): Promise<{ ok: true; profile: SocialProfile } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "knav",
      },
    });
    if (!res.ok) return { ok: false, error: `获取用户信息失败（${res.status}）` };
    const u = (await res.json()) as {
      id: number;
      login: string;
      name?: string;
      avatar_url?: string;
      email?: string;
    };

    let email = u.email ?? "";
    let verified = false;
    if (!email) {
      // 主邮箱为空时从已验证邮箱列表里取
      const em = await fetch("https://api.github.com/user/emails", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "knav",
        },
      });
      if (em.ok) {
        const list = (await em.json()) as {
          email: string;
          primary: boolean;
          verified: boolean;
        }[];
        const hit = list.find((e) => e.primary && e.verified) ?? list.find((e) => e.verified);
        if (hit) {
          email = hit.email;
          verified = true;
        }
      }
    }

    return {
      ok: true,
      profile: {
        provider: "github",
        id: String(u.id),
        username: u.login,
        nickname: u.name || u.login,
        avatar: u.avatar_url ?? "",
        email,
        emailVerified: verified,
      },
    };
  } catch (e) {
    return { ok: false, error: `请求 GitHub 失败：${(e as Error).message}` };
  }
}

/* ------------------------------------------------------------------ Gitee */

/**
 * Gitee 换 token。
 *
 * 与其它家不同：Gitee 的令牌接口要求 JSON body，返回里直接是 access_token。
 */
export async function exchangeGiteeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://gitee.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });
    const data = (await res.json()) as {
      access_token?: string;
      message?: string;
      error?: string;
      error_description?: string;
    };
    if (!data.access_token) {
      const detail = [data.error, data.error_description].filter(Boolean).join("：");
      return {
        ok: false,
        error: data.message || detail || `获取令牌失败（${res.status}）`,
      };
    }
    return { ok: true, token: data.access_token };
  } catch (e) {
    return { ok: false, error: `请求 Gitee 失败：${(e as Error).message}` };
  }
}

/** 取 Gitee 用户信息（要拿到邮箱，授权时得带 scope=user_info） */
export async function fetchGiteeProfile(
  token: string
): Promise<{ ok: true; profile: SocialProfile } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `https://gitee.com/api/v5/user?access_token=${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return { ok: false, error: `获取用户信息失败（${res.status}）` };
    const u = (await res.json()) as {
      id: number;
      login: string;
      name?: string;
      avatar_url?: string;
      email?: string;
    };
    return {
      ok: true,
      profile: {
        provider: "gitee",
        id: String(u.id),
        username: u.login,
        nickname: u.name || u.login,
        avatar: u.avatar_url ?? "",
        email: u.email ?? "",
        emailVerified: false,
      },
    };
  } catch (e) {
    return { ok: false, error: `请求 Gitee 失败：${(e as Error).message}` };
  }
}

/* ----------------------------------------------------------------- Google */

/** Google 的令牌接口用表单提交，不是 JSON */
export async function exchangeGoogleCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    const data = (await res.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!data.access_token) {
      return {
        ok: false,
        error: data.error_description || data.error || "获取令牌失败",
      };
    }
    return { ok: true, token: data.access_token };
  } catch (e) {
    return { ok: false, error: `请求 Google 失败：${(e as Error).message}` };
  }
}

/** 用 id_token / userinfo 拿 Google 账号信息 */
export async function fetchGoogleProfile(
  token: string
): Promise<{ ok: true; profile: SocialProfile } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, error: `获取用户信息失败（${res.status}）` };
    const u = (await res.json()) as {
      sub: string;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      email?: string;
      email_verified?: boolean;
    };
    return {
      ok: true,
      profile: {
        provider: "google",
        id: String(u.sub),
        // Google 的邮箱前缀不一定能当用户名用（含点、含大写），只取合法字符
        username: (u.email ?? "").split("@")[0] || u.sub.slice(0, 12),
        nickname: u.name || u.email || u.sub.slice(0, 12),
        avatar: u.picture ?? "",
        email: u.email ?? "",
        emailVerified: u.email_verified === true,
      },
    };
  } catch (e) {
    return { ok: false, error: `请求 Google 失败：${(e as Error).message}` };
  }
}

/* ------------------------------------------------------------ 绑定关系 / 登录 */

export interface UserIdentity {
  provider: Provider;
  providerId: string;
  username: string;
  email: string;
  createdAt: string;
}

interface IdentityRow {
  user_id: number;
  provider: string;
  provider_id: string;
  provider_username: string;
  provider_email: string;
  created_at: string;
}

const PROVIDERS: Provider[] = ["telegram", "github", "gitee", "google"];

function isProvider(value: string): value is Provider {
  return (PROVIDERS as string[]).includes(value);
}

function toIdentity(row: IdentityRow): UserIdentity | null {
  if (!isProvider(row.provider)) return null;
  return {
    provider: row.provider,
    providerId: row.provider_id,
    username: row.provider_username,
    email: row.provider_email,
    createdAt: row.created_at,
  };
}

/** 某个用户绑定的全部第三方账号 */
export async function listUserIdentities(userId: number): Promise<UserIdentity[]> {
  const rows = await query<IdentityRow>(
    `SELECT user_id, provider, provider_id, provider_username, provider_email, created_at
       FROM knav_user_identities WHERE user_id = ? ORDER BY id`,
    [userId]
  );
  return rows.map(toIdentity).filter((x): x is UserIdentity => x !== null);
}

/** 批量取多个用户的绑定（后台用户列表用，避免 N+1 查询） */
export async function getUserIdentityMap(
  userIds: number[]
): Promise<Record<number, UserIdentity[]>> {
  const out: Record<number, UserIdentity[]> = {};
  if (userIds.length === 0) return out;
  const ph = userIds.map(() => "?").join(",");
  const rows = await query<IdentityRow>(
    `SELECT user_id, provider, provider_id, provider_username, provider_email, created_at
       FROM knav_user_identities WHERE user_id IN (${ph}) ORDER BY id`,
    userIds
  );
  for (const row of rows) {
    const item = toIdentity(row);
    if (!item) continue;
    (out[row.user_id] ??= []).push(item);
  }
  return out;
}

/** 把第三方资料绑定到指定用户 */
export async function bindIdentity(
  userId: number,
  profile: SocialProfile
): Promise<{ ok: true; already?: boolean } | { ok: false; error: string }> {
  const hit = await queryOne<{ user_id: number }>(
    "SELECT user_id FROM knav_user_identities WHERE provider = ? AND provider_id = ? LIMIT 1",
    [profile.provider, profile.id]
  );
  if (hit) {
    if (hit.user_id === userId) return { ok: true, already: true };
    return {
      ok: false,
      error: `该 ${PROVIDER_LABEL[profile.provider]} 账号已绑定到其他用户`,
    };
  }

  const own = await queryOne<{ provider_id: string }>(
    "SELECT provider_id FROM knav_user_identities WHERE user_id = ? AND provider = ? LIMIT 1",
    [userId, profile.provider]
  );
  if (own) {
    return {
      ok: false,
      error: `当前账号已绑定另一个 ${PROVIDER_LABEL[profile.provider]} 账号，请先解绑`,
    };
  }

  try {
    await execute(
      `INSERT INTO knav_user_identities
         (user_id, provider, provider_id, provider_username, provider_email)
       VALUES (?,?,?,?,?)`,
      [
        userId,
        profile.provider,
        profile.id,
        (profile.username || "").slice(0, 190),
        (profile.email || "").slice(0, 190),
      ]
    );
  } catch (e) {
    if ((e as { code?: string }).code === "ER_DUP_ENTRY") {
      return { ok: false, error: "该第三方账号刚刚被其他用户绑定，请重新授权" };
    }
    throw e;
  }
  return { ok: true };
}

/**
 * 解绑某个平台。
 * 不允许把账号变成「没有密码、也没有任何第三方绑定」的不可登录状态。
 */
export async function unbindIdentity(
  userId: number,
  provider: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isProvider(provider)) return { ok: false, error: "不支持的登录方式" };

  const identity = await queryOne<{ id: number; provider_id: string }>(
    "SELECT id, provider_id FROM knav_user_identities WHERE user_id = ? AND provider = ? LIMIT 1",
    [userId, provider]
  );
  if (!identity) return { ok: false, error: "该平台尚未绑定" };

  const user = await queryOne<{ password_hash: string }>(
    "SELECT password_hash FROM knav_users WHERE id = ? LIMIT 1",
    [userId]
  );
  if (!user) return { ok: false, error: "用户不存在" };

  const others = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM knav_user_identities WHERE user_id = ? AND id <> ?",
    [userId, identity.id]
  );
  if (!user.password_hash && Number(others?.n) === 0) {
    return {
      ok: false,
      error: "这是当前账号唯一可用的登录方式；请先设置密码或绑定其他平台再解绑",
    };
  }

  await execute("DELETE FROM knav_user_identities WHERE id = ?", [identity.id]);
  // 老库在用户表上也存了一份 provider，清掉它，
  // 否则迁移脚本下次会把刚解绑的账号重新回填成绑定关系
  await execute(
    `UPDATE knav_users SET provider = NULL, provider_id = NULL, provider_email = ''
      WHERE id = ? AND provider = ? AND provider_id = ?`,
    [userId, provider, identity.provider_id]
  );
  return { ok: true };
}

/** 已绑定的第三方账号 → 本地用户；未绑定返回 null */
async function findIdentityAccount(
  provider: Provider,
  providerId: string
): Promise<{
  userId: number;
  status: string;
  email: string;
  username: string;
} | null> {
  const row = await queryOne<{
    user_id: number;
    status: string;
    email: string;
    username: string;
  }>(
    `SELECT i.user_id, u.status, u.email, u.username
       FROM knav_user_identities i
       JOIN knav_users u ON u.id = i.user_id
      WHERE i.provider = ? AND i.provider_id = ?
      LIMIT 1`,
    [provider, providerId]
  );
  return row
    ? {
        userId: row.user_id,
        status: row.status,
        email: row.email,
        username: row.username,
      }
    : null;
}

export type SocialLoginResult =
  | { ok: true; userId: number }
  | {
      ok: false;
      code: "not_found" | "pending" | "banned";
      error?: string;
      email?: string;
      username?: string;
    };

/** 第三方账号登录：只认已绑定账号，不再静默建号 */
export async function loginBySocial(
  profile: SocialProfile
): Promise<SocialLoginResult> {
  const account = await findIdentityAccount(profile.provider, profile.id);
  if (!account) return { ok: false, code: "not_found" };
  if (account.status === "banned") {
    return { ok: false, code: "banned", error: "账号已被封禁" };
  }
  if (account.status !== "active") {
    return {
      ok: false,
      code: "pending",
      email: account.email,
      username: account.username,
    };
  }

  await execute(
    "UPDATE knav_users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = ?",
    [account.userId]
  );
  return { ok: true, userId: account.userId };
}

/* ------------------------------------------------------ 首次登录的临时票据 */

export interface SocialTicket {
  provider: Provider;
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  email: string;
  emailVerified: boolean;
}

interface TicketRow {
  provider: string;
  provider_id: string;
  username: string;
  nickname: string;
  avatar: string;
  email: string;
  email_verified: number;
}

const TICKET_TTL_MINUTES = 30;

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function ticketToProfile(row: TicketRow): SocialTicket | null {
  if (!isProvider(row.provider)) return null;
  return {
    provider: row.provider,
    id: row.provider_id,
    username: row.username,
    nickname: row.nickname,
    avatar: row.avatar,
    email: row.email,
    emailVerified: !!row.email_verified,
  };
}

/** 未绑定的第三方账号先发一张票据，等用户选择绑定或注册 */
export async function issueSocialTicket(profile: SocialProfile): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = sha256(token);

  await transaction(async (conn) => {
    await conn.query(
      "DELETE FROM knav_social_tickets WHERE provider = ? AND provider_id = ?",
      [profile.provider, profile.id]
    );
    await conn.query(
      `INSERT INTO knav_social_tickets
         (id, provider, provider_id, username, nickname, avatar, email, email_verified,
          expires_at)
       VALUES (?,?,?,?,?,?,?,?, NOW() + INTERVAL ? MINUTE)`,
      [
        hash,
        profile.provider,
        profile.id,
        (profile.username || "").slice(0, 190),
        (profile.nickname || "").slice(0, 190),
        (profile.avatar || "").slice(0, 500),
        (profile.email || "").slice(0, 190),
        profile.emailVerified ? 1 : 0,
        TICKET_TTL_MINUTES,
      ]
    );
  });

  return token;
}

/** 读取票据（不消费），页面展示用 */
export async function readSocialTicket(token: string): Promise<SocialTicket | null> {
  if (!token) return null;
  const row = await queryOne<TicketRow>(
    `SELECT provider, provider_id, username, nickname, avatar, email, email_verified
       FROM knav_social_tickets WHERE id = ? AND expires_at > NOW() LIMIT 1`,
    [sha256(token)]
  );
  return row ? ticketToProfile(row) : null;
}

/** 消费票据：只有一次有效，成功后立即删除 */
export async function consumeSocialTicket(
  token: string
): Promise<SocialTicket | null> {
  if (!token) return null;
  const hash = sha256(token);
  return transaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT provider, provider_id, username, nickname, avatar, email, email_verified
         FROM knav_social_tickets WHERE id = ? AND expires_at > NOW() LIMIT 1 FOR UPDATE`,
      [hash]
    );
    const row = (rows as TicketRow[])[0];
    if (!row) return null;
    await conn.query("DELETE FROM knav_social_tickets WHERE id = ?", [hash]);
    return ticketToProfile(row);
  });
}

/* ------------------------------------------------------------ 新建第三方账号 */

function baseUsername(raw: string): string {
  let clean = (raw || "user")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 30)
    .toLowerCase();
  if (clean.length < 3) clean = `${clean || "user"}user`.slice(0, 30);
  return clean;
}

/** 给首次登录页一个没被占用的建议用户名 */
export async function suggestUsername(raw: string): Promise<string> {
  const base = baseUsername(raw);
  for (let i = 1; i <= 50; i++) {
    const candidate = i === 1 ? base : `${base}${i}`.slice(0, 30);
    const hit = await queryOne<{ id: number }>(
      "SELECT id FROM knav_users WHERE username = ? LIMIT 1",
      [candidate]
    );
    if (!hit) return candidate;
  }
  return `${base.slice(0, 24)}${String(Date.now()).slice(-6)}`;
}

/**
 * 新建一个第三方账号：账号先进入待验证状态，绑定关系立即建立。
 * 邮箱必须由本站验证，来源站是否验证过邮箱不作为放行依据。
 */
export async function createSocialAccount(
  profile: SocialProfile,
  input: { username: string; email: string; nickname?: string }
): Promise<
  | { ok: true; userId: number; mailOk: boolean; mailError?: string }
  | { ok: false; error: string }
> {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  const nickname = (input.nickname ?? "").trim().slice(0, 60);

  const uErr = validateUsername(username);
  if (uErr) return { ok: false, error: uErr };
  const eErr = validateEmail(email);
  if (eErr) return { ok: false, error: eErr };

  const identityTaken = await queryOne<{ user_id: number }>(
    "SELECT user_id FROM knav_user_identities WHERE provider = ? AND provider_id = ? LIMIT 1",
    [profile.provider, profile.id]
  );
  if (identityTaken) {
    return {
      ok: false,
      error: `该 ${PROVIDER_LABEL[profile.provider]} 账号已绑定到其他用户`,
    };
  }

  const dup = await queryOne<{ id: number }>(
    "SELECT id FROM knav_users WHERE username = ? OR email = ? LIMIT 1",
    [username, email]
  );
  if (dup) return { ok: false, error: "用户名或邮箱已被注册" };

  let userId: number;
  try {
    userId = await transaction(async (conn) => {
      const [res] = await conn.query(
        `INSERT INTO knav_users
           (username, email, password_hash, nickname, avatar, role, status,
            email_verified_at)
         VALUES (?,?,?,?,?,'user','pending',NULL)`,
        [
          username,
          email,
          "", // 第三方注册先不设密码，需要时可在账号设置里补
          nickname || username,
          (profile.avatar || "").slice(0, 500),
        ]
      );
      const newId = Number((res as { insertId: number }).insertId);
      await conn.query(
        `INSERT INTO knav_user_identities
           (user_id, provider, provider_id, provider_username, provider_email)
         VALUES (?,?,?,?,?)`,
        [
          newId,
          profile.provider,
          profile.id,
          (profile.username || "").slice(0, 190),
          (profile.email || "").slice(0, 190),
        ]
      );
      return newId;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "ER_DUP_ENTRY") {
      return { ok: false, error: "用户名、邮箱或该第三方账号刚刚被占用，请重试" };
    }
    throw e;
  }

  // 发信失败不撤账号：用户可在登录页或邮箱验证页重发
  const mail = await resendVerifyEmail(userId);
  if (!mail.ok) {
    return { ok: true, userId, mailOk: false, mailError: mail.error };
  }
  return { ok: true, userId, mailOk: true };
}

/* ---------------------------------------------------------------- 配置读取 */

/**
 * 凭据里常见的隐形字符（复制密钥时带上的空格、换行、零宽字符）
 * 会让授权页正常、换 token 却报 invalid_client，读取时统一清掉。
 */
function cleanCredential(value: string): string {
  return value.replace(/[\s\u200B-\u200D\uFEFF]+/g, "");
}

export async function getTelegramConfig(): Promise<{ botToken: string; botName: string }> {
  return {
    botToken: cleanCredential(await getSetting("telegram_bot_token")),
    botName: cleanCredential(await getSetting("telegram_bot_name")).replace(/^@+/, ""),
  };
}

export async function getGithubConfig(): Promise<{
  clientId: string;
  clientSecret: string;
}> {
  return {
    clientId: cleanCredential(await getSetting("github_client_id")),
    clientSecret: cleanCredential(await getSetting("github_client_secret")),
  };
}

export async function getGiteeConfig(): Promise<{
  clientId: string;
  clientSecret: string;
}> {
  return {
    clientId: cleanCredential(await getSetting("gitee_client_id")),
    clientSecret: cleanCredential(await getSetting("gitee_client_secret")),
  };
}

export async function getGoogleConfig(): Promise<{
  clientId: string;
  clientSecret: string;
}> {
  return {
    clientId: cleanCredential(await getSetting("google_client_id")),
    clientSecret: cleanCredential(await getSetting("google_client_secret")),
  };
}

/** 某个来源是否开启 + 凭据是否齐了 */
export async function getOAuthProviderStatus(
  provider: OAuthProvider
): Promise<{ enabled: boolean; configured: boolean; clientId: string }> {
  const [flag, conf] = await Promise.all([
    getSetting(`login_${provider}`),
    provider === "github"
      ? getGithubConfig()
      : provider === "gitee"
        ? getGiteeConfig()
        : getGoogleConfig(),
  ]);
  return {
    enabled: flag === "1",
    configured: Boolean(conf.clientId && conf.clientSecret),
    clientId: conf.clientId,
  };
}

/** OAuth 的 state Cookie 名（每个来源一个，互不干扰） */
export function stateCookie(provider: OAuthProvider): string {
  return `kw_${provider}_state`;
}

/** 本次授权是登录还是给当前账号绑定 */
export function intentCookie(provider: OAuthProvider): string {
  return `kw_${provider}_intent`;
}

/** 生成 state（防 CSRF） */
export function makeOAuthState(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** 统计各平台的绑定数量（后台概览用） */
export async function countSocialUsers(): Promise<Record<string, number>> {
  const rows = await query<{ provider: string; n: number }>(
    "SELECT provider, COUNT(*) AS n FROM knav_user_identities GROUP BY provider"
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.provider] = Number(r.n) || 0;
  return out;
}
