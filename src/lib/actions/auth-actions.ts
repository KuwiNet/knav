"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  registerUser,
  loginUser,
  createSession,
  destroySession,
  verifyEmail,
  resendVerifyEmail,
  requestPasswordReset,
  resetPassword,
  changePassword,
  getCurrentUser,
} from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { AVATAR_PRESETS, MAX_AVATAR_BYTES } from "@/lib/avatar-config";
import { imageExtFromBytes, recordMedia, saveBufferToLocal } from "@/lib/media";
import type { AvatarState, FormState } from "./types";

/**
 * 认证相关的 Server Actions。
 *
 * 统一返回 FormState，由客户端组件用 useActionState 渲染提示。
 */

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/* ------------------------------------------------------------------ 注册 */

export async function registerAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  if ((await getSetting("allow_register")) === "0") {
    return { error: "站点当前已关闭注册" };
  }

  const username = str(fd, "username");
  const email = str(fd, "email");
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");

  if (password !== confirm) return { error: "两次输入的密码不一致" };

  const r = await registerUser(username, email, password);
  if (!r.ok) return { error: r.error };

  return {
    success:
      "注册成功！验证邮件已发送到你填写的邮箱，请在 24 小时内点击邮件中的链接完成验证，验证后才能登录。",
  };
}

/** 登录 */
export async function loginAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const identifier = str(fd, "identifier");
  const password = String(fd.get("password") ?? "");

  if (!identifier || !password) return { error: "请输入账号和密码" };

  const r = await loginUser(identifier, password);
  if (!r.ok) return { error: r.error };

  await createSession(r.user.id);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** 退出登录 */
export async function logoutAction(): Promise<void> {
  await destroySession();
  revalidatePath("/", "layout");
  redirect("/");
}

/** 邮箱验证（链接进入时调用） */
export async function verifyEmailAction(token: string): Promise<FormState> {
  if (!token) return { error: "缺少验证令牌" };
  const r = await verifyEmail(token);
  if (!r.ok) return { error: r.error ?? "验证失败" };
  return { success: "邮箱验证成功！现在可以登录并开始投稿了。" };
}

/** 重发验证邮件 */
export async function resendVerifyAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const email = str(fd, "email");
  if (!email) return { error: "请输入邮箱" };

  const user = await getCurrentUser();
  // 未登录时允许按邮箱重发（仅针对 pending 状态的账号）
  let userId = user?.id;
  if (!userId) {
    const list = await import("@/lib/db").then((m) =>
      m.queryOne<{ id: number }>(
        "SELECT id FROM knav_users WHERE email = ? AND status = 'pending' LIMIT 1",
        [email]
      )
    );
    userId = list?.id;
  }
  if (!userId) {
    // 不暴露账号是否存在
    return { success: "如果该邮箱正在等待验证，我们已重新发送了验证邮件。" };
  }

  const r = await resendVerifyEmail(userId);
  if (!r.ok) return { error: r.error ?? "发送失败，请稍后再试" };
  return { success: "验证邮件已重新发送，请查收。" };
}

/** 发起找回密码 */
export async function forgotPasswordAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const identifier = str(fd, "identifier");
  if (!identifier) return { error: "请输入用户名或邮箱" };

  const r = await requestPasswordReset(identifier);
  if (!r.ok) return { error: r.error ?? "邮件发送失败，请稍后再试" };

  return {
    success:
      "如果该账号存在，重置密码的邮件已经发出（1 小时内有效）。请同时检查垃圾邮件箱。",
  };
}

/** 重置密码 */
export async function resetPasswordAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const token = str(fd, "token");
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (!token) return { error: "链接无效" };
  if (password !== confirm) return { error: "两次输入的密码不一致" };

  const r = await resetPassword(token, password);
  if (!r.ok) return { error: r.error ?? "重置失败" };
  return { success: "密码已重置，请用新密码登录。" };
}

/** 修改密码（已登录） */
export async function changePasswordAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const oldPassword = String(fd.get("oldPassword") ?? "");
  const newPassword = String(fd.get("newPassword") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (newPassword !== confirm) return { error: "两次输入的密码不一致" };

  const r = await changePassword(user.id, oldPassword, newPassword);
  if (!r.ok) return { error: r.error ?? "修改失败" };
  return { success: "密码修改成功" };
}

/** 更新个人资料（头像走 saveAvatarAction，这里不碰，避免旧表单值把刚换的头像覆盖回去） */
export async function updateProfileAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const nickname = str(fd, "nickname").slice(0, 50);
  const bio = str(fd, "bio").slice(0, 500);

  const { execute } = await import("@/lib/db");
  await execute(
    "UPDATE knav_users SET nickname = ?, bio = ? WHERE id = ?",
    [nickname || user.username, bio, user.id]
  );

  revalidatePath("/dashboard");
  return { success: "资料已保存" };
}

/**
 * 保存头像：选内置头像、改回默认首字母、上传图片，三种入口在同一个表单里。
 *
 * 点内置/默认按钮时提交的是 src（此时即便文件框里还留着上次选的图片也不再走上传），
 * 只有点「上传并保存」时表单里才没有 src、只有文件，两条路径不会互相插队。
 *
 * 不接受用户手填的外链：省掉防盗链裂图和访客 IP 泄露，也免去头像地址里塞 javascript: 的麻烦。
 */
export async function saveAvatarAction(
  _prev: AvatarState,
  fd: FormData
): Promise<AvatarState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  let src: string;

  if (fd.has("src")) {
    const raw = str(fd, "src");
    if (!raw) src = "";
    else if (AVATAR_PRESETS.some((p) => p.url === raw)) src = raw;
    else return { error: "头像地址无效" };
  } else {
    const file = fd.get("file");
    const f =
      file && typeof file === "object" && "arrayBuffer" in file
        ? (file as unknown as {
            size: number;
            name?: string;
            arrayBuffer(): Promise<ArrayBuffer>;
          })
        : null;
    if (!f || f.size === 0) return { error: "请先选择一张图片" };
    if (f.size > MAX_AVATAR_BYTES) {
      return {
        error: `图片 ${Math.round(f.size / 1024)} KB，超过 ${Math.round(
          MAX_AVATAR_BYTES / 1024 / 1024
        )} MB 上限`,
      };
    }
    const buf = Buffer.from(await f.arrayBuffer());
    const ext = imageExtFromBytes(buf);
    if (!ext) return { error: "只支持 PNG / JPEG / GIF / WebP 图片" };

    const saved = await saveBufferToLocal(buf, ext, f.name || "avatar");
    if (!saved.ok || !saved.relPath) return { error: saved.error ?? "保存失败" };
    await recordMedia({
      filename: f.name || "avatar",
      path: saved.relPath,
      url: saved.relPath,
      mime: `image/${ext}`,
      size: buf.length,
      width: saved.width ?? 0,
      height: saved.height ?? 0,
      alt: `用户 ${user.username} 的头像`,
    });
    src = saved.relPath;
  }

  const { execute } = await import("@/lib/db");
  await execute("UPDATE knav_users SET avatar = ? WHERE id = ?", [src, user.id]);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  return {
    success: src ? "头像已更新" : "已改回默认头像",
    avatar: src,
  };
}

/** 修改邮箱（需要重新验证） */
export async function changeEmailAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const email = str(fd, "email");
  const { validateEmail } = await import("@/lib/auth");
  const eErr = validateEmail(email);
  if (eErr) return { error: eErr };
  if (email === user.email) return { error: "新邮箱与当前邮箱相同" };

  const { queryOne, execute } = await import("@/lib/db");
  const exist = await queryOne<{ id: number }>(
    "SELECT id FROM knav_users WHERE email = ? AND id <> ? LIMIT 1",
    [email, user.id]
  );
  if (exist) return { error: "该邮箱已被其他账号使用" };

  // 生成验证令牌，等新邮箱验证通过后再切换
  const crypto = await import("node:crypto");
  const { sendVerifyEmail } = await import("@/lib/mail");
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  await execute(
    "INSERT INTO knav_email_tokens (user_id, email, purpose, token_hash, expires_at) VALUES (?,?,?,?, NOW() + INTERVAL 1 DAY)",
    [user.id, email, "change_email", hash]
  );

  const mail = await sendVerifyEmail(email, user.username, token);
  if (!mail.ok) return { error: mail.error ?? "邮件发送失败" };

  return { success: "验证邮件已发送到新邮箱，验证通过后才会切换邮箱。" };
}

/** 标记通知为已读 */
export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  const { execute } = await import("@/lib/db");
  await execute(
    "UPDATE knav_notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
    [id, user.id]
  );
  revalidatePath("/dashboard/notifications");
}

/** 全部标记为已读 */
export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const { execute } = await import("@/lib/db");
  await execute(
    "UPDATE knav_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
    [user.id]
  );
  revalidatePath("/dashboard/notifications");
}
