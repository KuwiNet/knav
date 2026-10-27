import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession, getCurrentUser } from "@/lib/auth";
import { normalizeOrigin } from "./asset-url";
import { getSetting } from "./settings";
import {
  bindIdentity,
  exchangeGiteeCode,
  exchangeGithubCode,
  exchangeGoogleCode,
  fetchGiteeProfile,
  fetchGithubProfile,
  fetchGoogleProfile,
  getGiteeConfig,
  getGithubConfig,
  getGoogleConfig,
  intentCookie,
  issueSocialTicket,
  loginBySocial,
  makeOAuthState,
  PROVIDER_LABEL,
  stateCookie,
  type OAuthProvider,
  type SocialProfile,
} from "./social-auth";

/**
 * OAuth2 授权码流程的公共骨架。
 *
 * GitHub / Gitee / Google 三家只有「授权页地址 + 换 token 的写法 + 用户信息接口」
 * 不同，跳转、state 校验、建号登录完全一样，所以抽成一份：
 * 路由只声明自己的来源，避免三份回调各写一遍容易漏校验。
 */

type TokenResult = { ok: true; token: string } | { ok: false; error: string };
type ProfileResult =
  | { ok: true; profile: SocialProfile }
  | { ok: false; error: string };

interface OAuthSpec {
  provider: OAuthProvider;
  /** 来源的授权页 */
  authorizeUrl: string;
  /** 授权页要带的参数（各家 scope 命名与必填项不同） */
  scope: string;
  getConfig(): Promise<{ clientId: string; clientSecret: string }>;
  exchange(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<TokenResult>;
  fetchProfile(token: string): Promise<ProfileResult>;
}

export const OAUTH_SPECS: Record<OAuthProvider, OAuthSpec> = {
  github: {
    provider: "github",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    scope: "read:user user:email",
    getConfig: getGithubConfig,
    exchange: (code, clientId, secret) => exchangeGithubCode(code, clientId, secret),
    fetchProfile: fetchGithubProfile,
  },
  gitee: {
    provider: "gitee",
    authorizeUrl: "https://gitee.com/oauth/authorize",
    // Gitee 的 v5 用户接口要 user_info 权限才返回邮箱
    scope: "user_info",
    getConfig: getGiteeConfig,
    exchange: exchangeGiteeCode,
    fetchProfile: fetchGiteeProfile,
  },
  google: {
    provider: "google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: "openid email profile",
    getConfig: getGoogleConfig,
    exchange: exchangeGoogleCode,
    fetchProfile: fetchGoogleProfile,
  },
};

/**
 * 回调地址：以后台「站点地址」为准，没设置时退回当前请求的 origin。
 *
 * 这个值要和来源应用后台登记的那一条逐字一致，而站点地址是用户唯一会去改的地方，
 * 所以以它为准（两边都去末尾斜杠）。子目录部署时 site_url 带路径，回调路径也跟着走。
 */
export async function redirectUri(
  req: Request,
  provider: OAuthProvider
): Promise<string> {
  const site = normalizeOrigin(await getSetting("site_url"));
  const base = site || new URL(req.url).origin;
  return `${base}/api/auth/${provider}/callback`;
}

/** 跳来源授权页（同时写入 state Cookie 防 CSRF） */
export async function startOAuth(
  req: Request,
  provider: OAuthProvider
): Promise<Response> {
  const spec = OAUTH_SPECS[provider];
  const flag = `login_${provider}`;
  const intent =
    new URL(req.url).searchParams.get("intent") === "bind" ? "bind" : "login";

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(
        intent === "bind"
          ? `/dashboard/profile?social_error=${encodeURIComponent(reason)}`
          : `/login?err=${provider}_${reason}`,
        req.url
      )
    );

  if (intent === "bind" && !(await getCurrentUser())) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if ((await getSetting(flag)) !== "1") return fail("disabled");

  const { clientId } = await spec.getConfig();
  if (!clientId) return fail("not_configured");

  const state = makeOAuthState();
  const jar = await cookies();
  jar.set(stateCookie(provider), state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  jar.set(intentCookie(provider), intent, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  const auth = new URL(spec.authorizeUrl);
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", await redirectUri(req, provider));
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", spec.scope);
  auth.searchParams.set("state", state);

  return NextResponse.redirect(auth.toString());
}

/** 处理来源回调：校验 state → 换 token → 取资料 → 登录 / 绑定 / 待完成 */
export async function completeOAuth(
  req: Request,
  provider: OAuthProvider
): Promise<Response> {
  const spec = OAUTH_SPECS[provider];
  const flag = `login_${provider}`;

  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const denied = url.searchParams.get("error");

  const jar = await cookies();
  const expect = jar.get(stateCookie(provider))?.value ?? "";
  const intent = jar.get(intentCookie(provider))?.value === "bind" ? "bind" : "login";
  jar.delete(stateCookie(provider));
  jar.delete(intentCookie(provider));

  const done = (path: string) => NextResponse.redirect(new URL(path, req.url));
  const fail = (reason: string) =>
    done(
      intent === "bind"
        ? `/dashboard/profile?social_error=${encodeURIComponent(reason)}`
        : `/login?err=${encodeURIComponent(reason)}`
    );

  if (denied) return fail(`${provider}_denied`);
  if (!code) return fail(`${provider}_no_code`);

  // state 缺失或对不上都拒绝
  if (!expect || !state || state !== expect) return fail(`${provider}_bad_state`);

  if ((await getSetting(flag)) !== "1") return fail(`${provider}_disabled`);

  const { clientId, clientSecret } = await spec.getConfig();
  if (!clientId || !clientSecret) return fail(`${provider}_not_configured`);

  const token = await spec.exchange(
    code,
    clientId,
    clientSecret,
    await redirectUri(req, provider)
  );
  if (!token.ok) return fail(`${provider}_token_failed`);

  const prof = await spec.fetchProfile(token.token);
  if (!prof.ok) return fail(`${provider}_profile_failed`);

  /* ------------------------------------------------------------ 绑定当前账号 */
  if (intent === "bind") {
    const user = await getCurrentUser();
    if (!user) return fail("登录状态已失效，请重新登录后再绑定");
    const bound = await bindIdentity(user.id, prof.profile);
    if (!bound.ok) return fail(bound.error);
    return done(`/dashboard/profile?social=bound&provider=${provider}`);
  }

  /* ---------------------------------------------------------------- 登录 */
  const r = await loginBySocial(prof.profile);
  if (r.ok) {
    await createSession(r.userId, req);
    return done("/dashboard");
  }

  if (r.code === "not_found") {
    const ticket = await issueSocialTicket(prof.profile);
    return done(`/social/complete?ticket=${ticket}`);
  }

  if (r.code === "pending") {
    const q = new URLSearchParams({
      pending: "1",
      email: r.email ?? "",
      provider: PROVIDER_LABEL[provider],
    });
    return done(`/verify-email?${q.toString()}`);
  }

  return fail(`${provider}_login_failed`);
}
