import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import {
  bindIdentity,
  getTelegramConfig,
  issueSocialTicket,
  loginBySocial,
  verifyTelegramAuth,
} from "@/lib/social-auth";
import { createSession, getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Telegram 登录 / 绑定回调。
 *
 * 前端加载 telegram-widget.js 后，组件把用户信息回调给页面，
 * 页面 POST 到这里；服务端用 Bot Token 校验签名。
 *
 * - 请求带 intent=bind：把 Telegram 绑定到当前登录账号
 * - 否则：已绑账号直接登录；未绑账号发一次性票据，跳转选择
 *   「绑定已有账号 / 新建账号」
 */
export async function POST(req: Request) {
  if ((await getSetting("login_telegram")) !== "1") {
    return NextResponse.json({ ok: false, error: "Telegram 登录未开启" }, { status: 403 });
  }

  const { botToken } = await getTelegramConfig();
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "尚未配置 Telegram Bot Token" }, { status: 400 });
  }

  let payload: Record<string, string>;
  let intent = "login";
  try {
    const body = await req.json();
    const raw =
      typeof body === "string" ? JSON.parse(body) : (body as Record<string, unknown>);
    // intent 是本站的字段，不参与 Telegram 签名计算
    intent = String(raw.intent ?? "") === "bind" ? "bind" : "login";
    const rest: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === "intent" || v === undefined || v === null) continue;
      rest[k] = String(v);
    }
    payload = rest;
  } catch {
    return NextResponse.json({ ok: false, error: "参数格式错误" }, { status: 400 });
  }

  if (!verifyTelegramAuth(payload, botToken)) {
    return NextResponse.json({ ok: false, error: "签名校验失败" }, { status: 403 });
  }

  // 签名正确但可能是几个月前的旧数据，拒绝重放
  const authDate = Number(payload.auth_date);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || Math.abs(now - authDate) > 10 * 60) {
    return NextResponse.json({ ok: false, error: "登录数据已过期，请重试" }, { status: 403 });
  }

  const id = String(payload.id ?? "");
  if (!id) {
    return NextResponse.json({ ok: false, error: "缺少用户标识" }, { status: 400 });
  }

  const profile = {
    provider: "telegram" as const,
    id,
    username: payload.username || `tg${id}`,
    nickname:
      [payload.first_name, payload.last_name].filter(Boolean).join(" ") ||
      payload.username ||
      `TG ${id}`,
    avatar: payload.photo_url || "",
    email: "",
    emailVerified: false,
  };

  if (intent === "bind") {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "登录状态已失效" }, { status: 401 });
    }
    const r = await bindIdentity(user.id, profile);
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, bound: true });
  }

  const r = await loginBySocial(profile);
  if (r.ok) {
    await createSession(r.userId, req);
    return NextResponse.json({ ok: true, redirect: "/dashboard" });
  }

  if (r.code === "not_found") {
    const ticket = await issueSocialTicket(profile);
    return NextResponse.json({
      ok: true,
      redirect: `/social/complete?ticket=${ticket}`,
    });
  }

  if (r.code === "pending") {
    const q = new URLSearchParams({
      pending: "1",
      email: r.email ?? "",
      provider: "Telegram",
    });
    return NextResponse.json({
      ok: true,
      redirect: `/verify-email?${q.toString()}`,
    });
  }

  return NextResponse.json(
    { ok: false, error: r.error || "账号已被封禁" },
    { status: 403 }
  );
}
