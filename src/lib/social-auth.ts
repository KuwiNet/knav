import crypto from "node:crypto";
import { query, queryOne, execute } from "./db";
import { getSetting } from "./settings";

/**
 * 第三方登录。
 *
 * 支持四种（后台「站点设置 → 登录方式」里分别开关并配置）：
 *   - Telegram：官方登录组件 → 服务端校验签名 → 建号登录
 *   - GitHub / Gitee / Google：OAuth2 授权码流程 → 换 token → 取用户信息 → 建号登录
 *
 * 第三方账号首次登录会自动建号（provider / provider_id 唯一），
 * 之后同一账号直接登录，不再走密码。
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
    };
    if (!data.access_token) {
      return {
        ok: false,
        error: data.message || data.error || `获取令牌失败（${res.status}）`,
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

/* ---------------------------------------------------------------- 建号 / 登录 */

/** 生成一个可用的用户名（来源侧用户名可能被占用） */
function uniqueUsername(base: string): string {
  const clean = (base || "user")
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .slice(0, 40)
    .toLowerCase();
  return clean || "user";
}

/**
 * 按第三方账号找到或创建本地用户。
 * 返回 null 表示该来源被禁用。
 */
export async function loginBySocial(
  profile: SocialProfile
): Promise<{ ok: true; userId: number } | { ok: false; error: string }> {
  const row = await queryOne<{ id: number; status: string }>(
    "SELECT id, status FROM knav_users WHERE provider = ? AND provider_id = ? LIMIT 1",
    [profile.provider, profile.id]
  );

  if (row) {
    if (row.status === "banned") return { ok: false, error: "账号已被封禁" };
    await execute(
      "UPDATE knav_users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = ?",
      [row.id]
    );
    return { ok: true, userId: row.id };
  }

  // 新建账号
  let username = uniqueUsername(profile.username);
  const dup = await queryOne<{ id: number }>(
    "SELECT id FROM knav_users WHERE username = ? LIMIT 1",
    [username]
  );
  if (dup) username = `${username}-${profile.id.slice(0, 6)}`.slice(0, 50);

  // 邮箱：来源没给就用占位邮箱（第三方登录已由来源验证身份）
  let email = profile.email?.trim() ?? "";
  if (!email) email = `${profile.provider}_${profile.id}@social.local`;
  const emailTaken = await queryOne<{ id: number }>(
    "SELECT id FROM knav_users WHERE email = ? LIMIT 1",
    [email]
  );
  if (emailTaken) email = `${profile.provider}_${profile.id}@social.local`;

  const { insertId } = await execute(
    `INSERT INTO knav_users
       (username, email, password_hash, nickname, avatar, role, status,
        email_verified_at, provider, provider_id, provider_email)
     VALUES (?,?,?,?,?,'user','active',NOW(),?,?,?)`,
    [
      username,
      email,
      "", // 第三方账号没有密码，登录只能用第三方入口
      profile.nickname || username,
      profile.avatar || "",
      profile.provider,
      profile.id,
      profile.email || "",
    ]
  );

  await execute(
    "INSERT INTO knav_notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)",
    [
      insertId,
      "system",
      "欢迎加入",
      `你已通过${PROVIDER_LABEL[profile.provider]}登录，账号已自动创建。`,
      "/dashboard/profile",
    ]
  );

  return { ok: true, userId: insertId };
}

/* ---------------------------------------------------------------- 配置读取 */

export async function getTelegramConfig(): Promise<{ botToken: string; botName: string }> {
  return {
    botToken: await getSetting("telegram_bot_token"),
    botName: await getSetting("telegram_bot_name"),
  };
}

export async function getGithubConfig(): Promise<{
  clientId: string;
  clientSecret: string;
}> {
  return {
    clientId: await getSetting("github_client_id"),
    clientSecret: await getSetting("github_client_secret"),
  };
}

export async function getGiteeConfig(): Promise<{
  clientId: string;
  clientSecret: string;
}> {
  return {
    clientId: await getSetting("gitee_client_id"),
    clientSecret: await getSetting("gitee_client_secret"),
  };
}

export async function getGoogleConfig(): Promise<{
  clientId: string;
  clientSecret: string;
}> {
  return {
    clientId: await getSetting("google_client_id"),
    clientSecret: await getSetting("google_client_secret"),
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

/** 生成 state（防 CSRF） */
export function makeOAuthState(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** 清理用户名里的非法字符并保证唯一（导出给路由用） */
export { uniqueUsername };

/** 统计第三方账号数量（后台概览用） */
export async function countSocialUsers(): Promise<Record<string, number>> {
  const rows = await query<{ provider: string; n: number }>(
    "SELECT provider, COUNT(*) AS n FROM knav_users GROUP BY provider"
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.provider] = Number(r.n) || 0;
  return out;
}
