import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { getTelegramConfig, verifyTelegramAuth, loginBySocial } from "@/lib/social-auth";
import { createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Telegram 登录回调。
 *
 * 前端加载 telegram-widget.js 后，组件把用户信息回调给页面，
 * 页面 POST 到这里；服务端用 Bot Token 校验签名后建号并写会话 Cookie。
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
  try {
    const body = await req.json();
    payload =
      typeof body === "string" ? JSON.parse(body) : (body as Record<string, string>);
  } catch {
    return NextResponse.json({ ok: false, error: "参数格式错误" }, { status: 400 });
  }

  if (!verifyTelegramAuth(payload, botToken)) {
    return NextResponse.json({ ok: false, error: "签名校验失败" }, { status: 403 });
  }

  const id = String(payload.id ?? "");
  if (!id) {
    return NextResponse.json({ ok: false, error: "缺少用户标识" }, { status: 400 });
  }

  const r = await loginBySocial({
    provider: "telegram",
    id,
    username: payload.username || `tg${id}`,
    nickname: [payload.first_name, payload.last_name].filter(Boolean).join(" ") || payload.username || `TG ${id}`,
    avatar: "",
    email: "",
    emailVerified: false,
  });
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: 403 });
  }

  await createSession(r.userId, req);
  return NextResponse.json({ ok: true });
}
