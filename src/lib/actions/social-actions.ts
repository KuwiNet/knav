"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  bindIdentity,
  consumeSocialTicket,
  createSocialAccount,
  readSocialTicket,
  unbindIdentity,
} from "@/lib/social-auth";
import { createSession, getCurrentUser, loginUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import type { FormState } from "./types";

/**
 * 第三方账号的首次登录与绑定操作。
 *
 * 首次登录先拿到一张一次性票据（/social/complete?ticket=…），
 * 用户可以绑定已有账号（校验本站密码）或用第三方资料新建账号
 * （用户名 / 邮箱可改，邮箱必须完成本站验证）。
 */

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export async function completeSocialAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const token = str(fd, "ticket");
  const mode = str(fd, "mode") === "bind" ? "bind" : "create";

  const ticket = await readSocialTicket(token);
  if (!ticket) {
    return { error: "这次授权已过期，请重新点击第三方登录。" };
  }

  if (mode === "bind") {
    const identifier = str(fd, "identifier");
    const password = String(fd.get("password") ?? "");
    if (!identifier || !password) {
      return { error: "请填写本站已有账号的用户名 / 邮箱和密码" };
    }

    const login = await loginUser(identifier, password);
    if (!login.ok) return { error: login.error };

    const bound = await bindIdentity(login.user.id, ticket);
    if (!bound.ok) return { error: bound.error };

    await consumeSocialTicket(token);
    await createSession(login.user.id);
    revalidatePath("/", "layout");
    redirect(`/dashboard/profile?social=bound&provider=${ticket.provider}`);
  }

  if ((await getSetting("allow_register")) === "0") {
    return { error: "站点当前已关闭注册，请改用「绑定已有账号」。" };
  }

  const r = await createSocialAccount(ticket, {
    username: str(fd, "username"),
    email: str(fd, "email"),
    nickname: str(fd, "nickname"),
  });
  if (!r.ok) return { error: r.error };

  await consumeSocialTicket(token);
  return {
    success: r.mailOk
      ? "账号已创建，验证邮件已发出。请先点击邮件里的链接完成邮箱验证，之后即可用这个第三方账号登录。"
      : `账号已创建，但验证邮件没发出去（${r.mailError ?? "未知原因"}）。请到登录页重新发送验证邮件，验证后再登录。`,
  };
}

/** 个人中心解绑第三方账号 */
export async function unbindSocialAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const provider = str(fd, "provider");
  const r = await unbindIdentity(user.id, provider);
  if (!r.ok) return { error: r.error ?? "解绑失败" };

  revalidatePath("/dashboard/profile");
  revalidatePath("/", "layout");
  return { success: "已解绑，可以用其它方式继续登录。" };
}
