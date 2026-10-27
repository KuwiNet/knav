"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  getCurrentUser,
  isAdmin,
  isOwner,
  notify,
  resendVerifyEmail,
  sendAdminPasswordResetLink,
  sendSiteResetCode,
  consumeSiteResetCode,
} from "@/lib/auth";
import { reviewSubmission } from "@/lib/submissions";
import { sendNotifyMail, getMailConfig } from "@/lib/mail";
import { query, queryOne, execute, transaction } from "@/lib/db";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  setContentStatus,
  deleteContent,
  getAdminContentDetail,
} from "@/lib/admin";
import {
  createContent,
  updateContent,
  localizeContentAssets,
  bulkContent,
  moveContentOrder,
  moveCategoryOrder,
  mergeCategory,
  createManagedUser,
  updateManagedUser,
  deleteManagedUser,
  resetUserPassword,
  createPlatform,
  updatePlatform,
  deletePlatform,
  deletePlatforms,
  togglePlatforms,
  setSoftwareTitle,
  createSoftware,
  createMirror,
  updateMirror,
  deleteMirror,
  toggleMirrors,
  type ContentType,
} from "@/lib/admin-manage";
import { localizeImage } from "@/lib/media";
import { resetAssetBaseCache } from "@/lib/asset-url";
import { resetWallpaperCache } from "@/lib/wallpaper";
import { fetchSiteMeta } from "@/lib/site-fetch";
import { logAction } from "@/lib/admin-log";
import { unbindIdentity, PROVIDER_LABEL, type Provider } from "@/lib/social-auth";
import { resetSite } from "@/lib/site-reset";
import { RESET_SCOPES } from "@/lib/site-reset-config";
import {
  saveSettingValues,
  fieldsOfGroup,
  SETTING_MAP,
  resetSettingsCache,
} from "@/lib/settings";
import type { AdminContentDetail, PlatformVersion } from "@/lib/admin-types";
import type { FormState } from "./types";

/**
 * 后台 Server Actions。
 * 每个动作都先校验当前用户是否为编辑/管理员。
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    throw new Error("无权访问");
  }
  return user!;
}

/** 站长专属操作（站点重置、转移站长） */
async function requireOwner() {
  const user = await getCurrentUser();
  if (!isOwner(user)) {
    throw new Error("只有站长可以执行此操作");
  }
  return user!;
}

/**
 * 读取开关型字段。
 *
 * 后台的开关控件同时渲染了隐藏域（值 0）和复选框（值 1）：
 * 勾选时 FormData 里是 ["0","1"]，未勾选时是 ["0"]。
 * 直接用 get() 永远拿到隐藏域的 0，开关就会"保存后恢复原样"，
 * 所以这里取全部值，只要里面有 1 就算开启。
 */
function readSwitch(fd: FormData, key: string): boolean {
  return fd.getAll(key).map(String).includes("1");
}

/* ---------------------------------------------------------------- 审核 */

export async function reviewAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const admin = await requireAdmin();
  const id = Number(fd.get("id"));
  const decision = String(fd.get("decision") ?? "");
  const note = String(fd.get("note") ?? "").trim();

  if (!id) return { error: "缺少投稿 ID" };
  if (decision !== "approve" && decision !== "reject") {
    return { error: "未知的审核动作" };
  }
  const approved = decision === "approve";
  if (!approved && !note) return { error: "驳回时请填写审核意见" };

  const r = await reviewSubmission(id, admin.id, approved, note);
  if (!r.ok) return { error: r.error ?? "操作失败" };

  await logAction("submission.review", `投稿 #${id}`, { approved, note });
  revalidatePath("/admin/submissions");
  revalidatePath("/admin");
  return { success: approved ? "已通过审核并发布" : "已驳回，并已通知作者" };
}

/* ---------------------------------------------------------------- 用户 */

export async function setUserStatusAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const status = String(fd.get("status"));
  if (!id) return;
  const target = await queryOne<{ role: string }>(
    "SELECT role FROM knav_users WHERE id = ? LIMIT 1",
    [id]
  );
  if (!target) return;
  if (target.role === "owner") throw new Error("站长账号不能被封禁或修改状态");

  if (status === "banned") {
    // 封禁同时踢掉在线会话
    await execute("UPDATE knav_users SET status = 'banned' WHERE id = ?", [id]);
    await execute("DELETE FROM knav_sessions WHERE user_id = ?", [id]);
  } else if (status === "active") {
    await execute(
      "UPDATE knav_users SET status = 'active', email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?",
      [id]
    );
  } else if (status === "pending") {
    await execute("UPDATE knav_users SET status = 'pending' WHERE id = ?", [id]);
  }
  await logAction("user.status", `用户 #${id}`, status);
  revalidatePath("/admin/users");
}

export async function setUserRoleAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const role = String(fd.get("role"));
  if (!id || !["user", "editor", "admin"].includes(role)) return;
  const target = await queryOne<{ role: string }>(
    "SELECT role FROM knav_users WHERE id = ? LIMIT 1",
    [id]
  );
  if (!target) return;
  if (target.role === "owner") {
    throw new Error("站长身份只能通过「转移站长」变更");
  }
  await execute("UPDATE knav_users SET role = ? WHERE id = ?", [role, id]);
  await logAction("user.role", `用户 #${id}`, role);
  revalidatePath("/admin/users");
}

/** 后台给用户发通知（站内 + 邮件） */
export async function notifyUserAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const userId = Number(fd.get("userId"));
  const title = String(fd.get("title") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  if (!userId || !title) return { error: "请填写通知标题" };

  const row = await queryOne<{ username: string; email: string }>(
    "SELECT username, email FROM knav_users WHERE id = ? LIMIT 1",
    [userId]
  );
  if (!row) return { error: "用户不存在" };

  await notify(userId, "admin", title, body, "/dashboard/notifications");
  await sendNotifyMail(row.email, row.username, title, body);

  revalidatePath("/admin/users");
  return { success: `已通知 ${row.username}` };
}

/** 新增用户 */
export async function createUserAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const r = await createManagedUser({
    username: String(fd.get("username") ?? ""),
    email: String(fd.get("email") ?? ""),
    password: String(fd.get("password") ?? ""),
    nickname: String(fd.get("nickname") ?? ""),
    role: (String(fd.get("role") ?? "user") as "user" | "editor" | "admin"),
    status: (String(fd.get("status") ?? "active") as
      | "pending"
      | "active"
      | "banned"),
  });
  if (!r.ok) return { error: r.error ?? "创建失败" };
  await logAction("user.create", String(fd.get("username") ?? ""));
  revalidatePath("/admin/users");
  return { success: "用户已创建" };
}

/** 修改用户资料 */
export async function updateUserAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const me = await requireAdmin();
  const id = Number(fd.get("id"));
  if (!id) return { error: "缺少用户 ID" };
  // 站长账号的角色/状态在表单里是只读的（不提交），这里必须容忍字段缺失，
  // 否则会被当成「改成 user」触发服务器的降级保护
  const role = fd.get("role");
  const status = fd.get("status");
  const r = await updateManagedUser(
    id,
    {
      email: String(fd.get("email") ?? ""),
      nickname: String(fd.get("nickname") ?? ""),
      avatar: String(fd.get("avatar") ?? ""),
      bio: String(fd.get("bio") ?? ""),
      role:
        role === null
          ? undefined
          : (String(role) as "user" | "editor" | "admin" | "owner"),
      status:
        status === null
          ? undefined
          : (String(status) as "pending" | "active" | "banned"),
    },
    { id: me.id, role: me.role }
  );
  if (!r.ok) return { error: r.error ?? "保存失败" };
  await logAction("user.update", `用户 #${id}`);

  let notice = "";
  if (r.emailChanged) {
    // 换邮箱等于换了找回凭据的渠道：让当前会话失效，验证邮件发到新地址，
    // 用户必须重新登录并先验证邮箱（loginUser 那边拦）
    await execute("DELETE FROM knav_sessions WHERE user_id = ?", [id]);
    const mail = await resendVerifyEmail(id);
    notice = mail.ok
      ? "，验证邮件已发到新邮箱，该用户需重新登录并验证"
      : `，验证邮件发送失败（${mail.error ?? "未知原因"}），可到用户列表点「通过验证」手动放行`;
  }

  revalidatePath("/admin/users");
  return { success: `已保存${notice}` };
}

/** 删除用户 */
export async function deleteUserAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!id) return;
  const r = await deleteManagedUser(id);
  if (!r.ok) throw new Error(r.error ?? "删除失败");
  await logAction("user.delete", `用户 #${id}`);
  revalidatePath("/admin/users");
}

/** 重置用户密码：不填密码只发设置链接；填了密码则改密码并同时发临时密码与链接 */
export async function resetUserPasswordAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const me = await requireAdmin();
  const id = Number(fd.get("id"));
  const password = String(fd.get("password") ?? "");
  if (!id) return { error: "缺少用户 ID" };
  const target = await queryOne<{ username: string; role: string }>(
    "SELECT username, role FROM knav_users WHERE id = ? LIMIT 1",
    [id]
  );
  if (!target) return { error: "用户不存在" };
  if (target.role === "owner" && me?.id !== id) {
    return { error: "站长账号的密码只能由站长本人重置" };
  }

  const withPassword = password.trim().length > 0;
  if (withPassword) {
    const r = await resetUserPassword(id, password);
    if (!r.ok) return { error: r.error ?? "重置失败" };
    await logAction("user.reset_password", `用户 #${id}`);
  } else {
    await logAction("user.reset_password_link", `用户 #${id}`);
  }

  const link = await sendAdminPasswordResetLink(
    id,
    withPassword ? password : undefined
  );
  if (!link.ok) {
    // 站内通知已经写入，只有邮件没出去（SMTP 未配 / 退信），别让用户误以为两条都没发
    return {
      success: withPassword
        ? `密码已重置，会话已失效；站内通知已发出，但邮件没发出去（${link.error ?? "未知原因"}），可把刚才的临时密码直接转达给用户`
        : `「设置新密码」的站内通知已发出，但邮件没发出去（${link.error ?? "未知原因"}）`,
    };
  }
  return {
    success: withPassword
      ? "密码已重置，会话已失效；邮件与站内通知已发出，用户可用临时密码登录，也可点链接自行重设"
      : "已发送「设置新密码」链接（站内通知 + 邮件），当前密码未改动",
  };
}

/**
 * 后台解绑用户的第三方账号。
 * 与用户自助解绑共用同一套保护：不能把账号解成没有任何登录方式的状态。
 */
export async function adminUnbindIdentityAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const me = await requireAdmin();
  const userId = Number(fd.get("userId"));
  const provider = String(fd.get("provider") ?? "");
  if (!userId || !provider) return { error: "缺少参数" };

  const target = await queryOne<{ username: string; role: string }>(
    "SELECT username, role FROM knav_users WHERE id = ? LIMIT 1",
    [userId]
  );
  if (!target) return { error: "用户不存在" };
  if (target.role === "owner" && me.id !== userId) {
    return { error: "站长账号的绑定只能由站长本人管理" };
  }

  const r = await unbindIdentity(userId, provider);
  if (!r.ok) return { error: r.error ?? "解绑失败" };

  const label = PROVIDER_LABEL[provider as Provider] ?? provider;
  await logAction("user.unbind", `用户 #${userId} ${target.username}`, provider);
  revalidatePath("/admin/users");
  return { success: `已解绑 ${target.username} 的 ${label} 账号` };
}

/**
 * 转移站长：把某个管理员提升为站长，原站长降为管理员。
 * 只有站长本人能操作，保证全站始终恰好一个 owner。
 */
export async function transferOwnerAction(fd: FormData): Promise<void> {
  const me = await requireOwner();
  const id = Number(fd.get("id"));
  if (!id || id === me.id) return;
  const target = await queryOne<{ username: string; role: string }>(
    "SELECT username, role FROM knav_users WHERE id = ? LIMIT 1",
    [id]
  );
  if (!target) throw new Error("用户不存在");
  if (target.role !== "admin") throw new Error("只能把管理员提升为站长");

  await transaction(async (conn) => {
    await conn.query("UPDATE knav_users SET role = 'admin' WHERE id = ?", [me.id]);
    await conn.query("UPDATE knav_users SET role = 'owner' WHERE id = ?", [id]);
  });
  await logAction("user.transfer_owner", `用户 #${id}`, target.username);
  revalidatePath("/admin/users");
  revalidatePath("/", "layout");
}

/* ---------------------------------------------------------------- 站点重置（仅站长） */

/** 给站长邮箱发一次性验证码 */
export async function sendSiteResetCodeAction(
  _prev: FormState
): Promise<FormState> {
  const me = await requireOwner();
  const r = await sendSiteResetCode(me.id);
  if (!r.ok) return { error: r.error ?? "验证码发送失败" };
  return {
    success: `验证码已发送到 ${me.email}，10 分钟内有效。没收到请检查垃圾箱，或重新发送。`,
  };
}

/** 校验验证码后按勾选范围清空站点数据 */
export async function executeSiteResetAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const me = await requireOwner();
  const code = String(fd.get("code") ?? "").trim();
  const raw = fd.getAll("scopes").map(String);
  const picked = RESET_SCOPES.filter((s) => raw.includes(s.key));
  if (picked.length === 0) return { error: "请至少勾选一项要清空的数据" };
  if (!code) return { error: "请填写站长邮箱收到的验证码" };
  if (!(await consumeSiteResetCode(me.id, code))) {
    return { error: "验证码不正确或已过期，已作废，请重新发送验证码" };
  }

  const r = await resetSite(picked.map((s) => s.key));
  if (!r.ok) return { error: r.error ?? "重置失败" };

  await logAction("site.reset", "站点重置", picked.map((s) => s.key));
  revalidatePath("/", "layout");
  return {
    success: `已清空：${picked.map((s) => s.label).join("、")}${
      r.filesRemoved ? "；上传文件已删除" : ""
    }。站长账号与当前登录会话已保留。`,
  };
}

/* ---------------------------------------------------------------- 分类 */

export async function createCategoryAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const name = String(fd.get("name") ?? "").trim();
  const slug = String(fd.get("slug") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim();
  const parent = Number(fd.get("parent") ?? 0);
  const icon = String(fd.get("icon") ?? "").trim();
  const order = Number(fd.get("order") ?? 0);
  const cover = String(fd.get("cover") ?? "").trim();

  const r = await createCategory({
    name,
    slug,
    description,
    parent,
    icon,
    order,
    cover: await localizeImage(cover),
  });
  if (!r.ok) return { error: r.error ?? "创建失败" };

  await logAction("category.create", name, { slug, parent });
  revalidatePath("/admin/categories");
  revalidatePath("/category");
  revalidatePath("/");
  return { success: `分类「${name}」已创建` };
}

export async function updateCategoryAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const name = String(fd.get("name") ?? "").trim();
  const slug = String(fd.get("slug") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim();
  const parent = Number(fd.get("parent") ?? 0);
  const icon = String(fd.get("icon") ?? "").trim();
  const order = Number(fd.get("order") ?? 0);
  const cover = String(fd.get("cover") ?? "").trim();

  if (!id) return { error: "缺少分类 ID" };

  const r = await updateCategory({
    id,
    name,
    slug,
    description,
    parent,
    icon,
    order,
    cover: await localizeImage(cover),
  });
  if (!r.ok) return { error: r.error ?? "保存失败" };

  await logAction("category.update", name, { slug, parent, icon });
  revalidatePath("/admin/categories");
  revalidatePath("/category");
  revalidatePath("/");
  return { success: "已保存" };
}

export async function deleteCategoryAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!id) return;
  await deleteCategory(id);
  await logAction("category.delete", `分类 #${id}`);
  revalidatePath("/admin/categories");
  revalidatePath("/category");
  revalidatePath("/");
}

/** 分类上移 / 下移 */
export async function moveCategoryAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const dir = String(fd.get("dir")) as "up" | "down";
  if (!id || (dir !== "up" && dir !== "down")) return;
  const r = await moveCategoryOrder(id, dir);
  if (!r.ok) throw new Error(r.error ?? "调整失败");
  await logAction("category.move", `分类 #${id}`, dir);
  revalidatePath("/admin/categories");
  revalidatePath("/category");
  revalidatePath("/");
}

/** 合并分类 */
export async function mergeCategoryAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const fromId = Number(fd.get("fromId"));
  const toId = Number(fd.get("toId"));
  const r = await mergeCategory(fromId, toId);
  if (!r.ok) return { error: r.error ?? "合并失败" };
  await logAction("category.merge", `#${fromId} → #${toId}`, {
    moved: r.moved,
  });
  revalidatePath("/admin/categories");
  revalidatePath("/category");
  revalidatePath("/");
  return { success: `已合并，迁移 ${r.moved ?? 0} 条内容` };
}

/* ---------------------------------------------------------------- 内容 */

/**
 * 读取多平台版本列表。
 *
 * 表单里用一个隐藏域传 JSON 数组（平台 / 版本 / 主镜像名称 / 主镜像地址 / 大小）。
 * 没传这个字段时返回 undefined，表示"这次没动平台版本"，
 * 服务端就不会覆盖「下载管理」里维护的记录。
 */
function readVersions(fd: FormData): PlatformVersion[] | undefined {
  const raw = String(fd.get("versions") ?? "").trim();
  if (!raw) return undefined;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return undefined;
    return arr
      .map((v: any) => ({
        id: Number(v?.id) > 0 ? Number(v.id) : undefined,
        name: String(v?.name ?? ""),
        platform: String(v?.platform ?? ""),
        arch: String(v?.arch ?? ""),
        version: String(v?.version ?? ""),
        url: String(v?.url ?? ""),
        fileSize: String(v?.fileSize ?? ""),
      }))
      // 平台 / 版本 / 链接任一有值就算一条：
      // 只按链接过滤会把「下载管理」里建好但还没填地址的平台版本误删
      .filter((v) => v.platform.trim() || v.version.trim() || v.url.trim());
  } catch {
    return undefined;
  }
}

/**
 * 分类多选：表单用同名字段重复提交，第一个作为主分类。
 * 没有多选字段时回退到单选的 categoryId（下载管理等旧表单）。
 */
function readCategoryIds(fd: FormData): number[] {
  const ids = [
    ...new Set(
      fd
        .getAll("categoryIds")
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ];
  if (ids.length === 0) {
    const single = Number(fd.get("categoryId") ?? 0);
    if (single > 0) ids.push(single);
  }
  return ids;
}

export async function createContentAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const type = String(fd.get("type") ?? "site") as ContentType;
  const input = {
    type,
    title: String(fd.get("title") ?? ""),
    url: String(fd.get("url") ?? ""),
    description: String(fd.get("description") ?? ""),
    contentMd: String(fd.get("contentMd") ?? ""),
    categoryIds: readCategoryIds(fd),
    tags: String(fd.get("tags") ?? ""),
    cover: String(fd.get("cover") ?? ""),
    icon: String(fd.get("icon") ?? ""),
    order: Number(fd.get("order") ?? 0),
    sticky: readSwitch(fd, "sticky") ? 1 : 0,
    status: (String(fd.get("status") ?? "publish") as
      | "publish"
      | "draft"
      | "trash"),
    date: String(fd.get("date") ?? ""),
    version: String(fd.get("version") ?? ""),
    platform: String(fd.get("platform") ?? ""),
    versions: readVersions(fd),
  };
  const r = await createContent(input);
  if (!r.ok) return { error: r.error ?? "创建失败" };
  after(() => localizeContentAssets(r.id, input));
  await logAction("content.create", String(fd.get("title") ?? ""), { type });
  // 页面都是 force-dynamic，不需要服务端缓存失效；
  // 这里若调用 revalidatePath，Next 会把整页重新渲染后塞进响应，慢链路上「保存中」会很久。
  // 列表由客户端在保存成功后 router.refresh() 更新。
  return { success: "内容已创建" };
}

export async function updateContentAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!id) return { error: "缺少内容 ID" };
  const type = String(fd.get("type") ?? "site") as ContentType;
  const input = {
    type,
    title: String(fd.get("title") ?? ""),
    url: String(fd.get("url") ?? ""),
    description: String(fd.get("description") ?? ""),
    contentMd: String(fd.get("contentMd") ?? ""),
    categoryIds: readCategoryIds(fd),
    tags: String(fd.get("tags") ?? ""),
    // 网址 / 应用表单没有封面字段：没提交就保持原值，别把已有封面清空
    cover: fd.has("cover") ? String(fd.get("cover")) : undefined,
    icon: String(fd.get("icon") ?? ""),
    order: Number(fd.get("order") ?? 0),
    sticky: readSwitch(fd, "sticky") ? 1 : 0,
    status: (String(fd.get("status") ?? "publish") as
      | "publish"
      | "draft"
      | "trash"),
    date: String(fd.get("date") ?? ""),
    version: String(fd.get("version") ?? ""),
    platform: String(fd.get("platform") ?? ""),
    versions: readVersions(fd),
  };
  const r = await updateContent(id, input);
  if (!r.ok) return { error: r.error ?? "保存失败" };
  after(() => localizeContentAssets(id, input));
  await logAction("content.update", String(fd.get("title") ?? ""), { type, id });
  // 同上：保存响应只回结果，列表在客户端刷新
  return { success: "已保存" };
}

/** 抓取目标站点的公开信息（后台添加网址时点「获取」） */
export async function fetchSiteMetaAction(
  url: string
): Promise<
  | { ok: true; title: string; description: string; icon: string; cover: string; finalUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const r = await fetchSiteMeta(url);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ...r.meta };
}

/** 读取单条内容的完整信息（编辑表单用） */
export async function getContentDetailAction(
  id: number
): Promise<AdminContentDetail | null> {
  await requireAdmin();
  return getAdminContentDetail(id);
}

/** 批量操作内容 */
export async function bulkContentAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const ids = String(fd.get("ids") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  const op = String(fd.get("op") ?? "") as
    | "publish"
    | "draft"
    | "trash"
    | "delete"
    | "sticky"
    | "unstick"
    | "category";
  if (ids.length === 0) return;
  const r = await bulkContent(ids, op, {
    categoryId: Number(fd.get("categoryId") ?? 0),
  });
  if (!r.ok) throw new Error(r.error ?? "操作失败");
  await logAction("content.bulk", `${ids.length} 条内容`, op);
  revalidatePath("/admin/content");
  revalidatePath("/");
}

/** 内容上移 / 下移 */
export async function moveContentAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const dir = String(fd.get("dir")) as "up" | "down";
  if (!id) return;
  const categoryId = Number(fd.get("categoryId") ?? 0);
  const r = await moveContentOrder(id, dir, categoryId || undefined);
  if (!r.ok) throw new Error(r.error ?? "调整失败");
  await logAction("content.move", `内容 #${id}`, dir);
  revalidatePath("/admin/content");
}

export async function setContentStatusAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const status = String(fd.get("status")) as "publish" | "draft" | "trash";
  if (!id) return;
  await setContentStatus(id, status);
  await logAction("content.status", `内容 #${id}`, status);
  revalidatePath("/admin/content");
  revalidatePath("/");
}

export async function deleteContentAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!id) return;
  await deleteContent(id);
  await logAction("content.delete", `内容 #${id}`);
  revalidatePath("/admin/content");
  revalidatePath("/");
}

/* ------------------------------------------------ 下载：平台版本 + 镜像链接 */

/** 新增软件的一个平台版本 */
export async function createPlatformAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const contentId = Number(fd.get("contentId") ?? 0);
  if (!contentId) return { error: "缺少所属软件" };
  const platform = String(fd.get("platform") ?? "").trim();
  const arch = String(fd.get("arch") ?? "").trim();
  const r = await createPlatform({
    contentId,
    resourceTitle: String(fd.get("resourceTitle") ?? ""),
    platform,
    arch,
    version: String(fd.get("version") ?? ""),
    fileSize: String(fd.get("fileSize") ?? ""),
    sha256: String(fd.get("sha256") ?? ""),
    preview: String(fd.get("preview") ?? ""),
    note: String(fd.get("note") ?? ""),
    enabled: readSwitch(fd, "enabled"),
    sort: Number(fd.get("sort") ?? 0),
  });
  if (!r.ok) return { error: r.error ?? "保存失败" };

  // 顺手把主下载链接建成第一条镜像，省得再去点一次「添加镜像」
  const url = String(fd.get("url") ?? "").trim();
  if (url && r.id) {
    await createMirror({
      downloadId: r.id,
      name: String(fd.get("mirrorName") ?? "").trim() || "官方下载",
      url,
      fileSize: String(fd.get("fileSize") ?? ""),
      note: String(fd.get("mirrorNote") ?? ""),
      sort: 0,
    });
  }

  await logAction("download.platform.create", `${platform || "通用"}${arch ? ` ${arch}` : ""}`, {
    contentId,
  });
  revalidatePath("/admin/downloads");
  revalidatePath(`/app/${contentId}.html`);
  return { success: "平台版本已添加" };
}

/** 修改平台版本 */
export async function updatePlatformAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!id) return { error: "缺少平台版本 ID" };
  const contentId = Number(fd.get("contentId") ?? 0) || undefined;
  const r = await updatePlatform(id, {
    contentId,
    resourceTitle: String(fd.get("resourceTitle") ?? ""),
    platform: String(fd.get("platform") ?? ""),
    arch: String(fd.get("arch") ?? ""),
    version: String(fd.get("version") ?? ""),
    fileSize: String(fd.get("fileSize") ?? ""),
    sha256: String(fd.get("sha256") ?? ""),
    preview: String(fd.get("preview") ?? ""),
    note: String(fd.get("note") ?? ""),
    enabled: readSwitch(fd, "enabled"),
    sort: Number(fd.get("sort") ?? 0),
  });
  if (!r.ok) return { error: r.error ?? "保存失败" };
  await logAction("download.platform.update", `平台版本 #${id}`);
  revalidatePath("/admin/downloads");
  if (contentId) revalidatePath(`/app/${contentId}.html`);
  return { success: "已保存" };
}

/**
 * 新增软件。
 *
 * 下载管理的主操作是「加一个软件」，不是「加一个平台」——
 * 平台只是某个软件下面的子项。软件名称直接填，不强制从已有内容里选，
 * 否则以后就只能给老内容挂下载、加不了新软件。
 * 也允许通过 linkContentId 关联到一条已有内容（给老文章补下载用）。
 */
export async function createSoftwareAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const name = String(fd.get("name") ?? "").trim();
  const linkContentId = Number(fd.get("linkContentId") ?? 0) || undefined;
  if (!linkContentId && !name) return { error: "软件名称不能为空" };

  const r = await createSoftware({
    name,
    linkContentId,
    categoryId: Number(fd.get("categoryId") ?? 0) || undefined,
    description: String(fd.get("description") ?? ""),
    url: String(fd.get("url") ?? ""),
    icon: String(fd.get("icon") ?? ""),
    platform: String(fd.get("platform") ?? ""),
    arch: String(fd.get("arch") ?? ""),
    version: String(fd.get("version") ?? ""),
    fileSize: String(fd.get("fileSize") ?? ""),
    mirrorName: String(fd.get("mirrorName") ?? ""),
    mirrorUrl: String(fd.get("mirrorUrl") ?? ""),
    mirrorNote: String(fd.get("mirrorNote") ?? ""),
  });
  if (!r.ok) return { error: r.error };

  await logAction("download.software.create", name || `内容 #${r.contentId}`);
  revalidatePath("/admin/downloads");
  revalidatePath("/admin/content");
  revalidatePath(`/app/${r.contentId}.html`);
  revalidatePath("/");
  return { success: `软件「${name || "已关联内容"}」已添加` };
}

/** 删除平台版本（连带它下面的镜像链接） */
export async function deletePlatformAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!id) return;
  await deletePlatform(id);
  await logAction("download.platform.delete", `平台版本 #${id}`);
  revalidatePath("/admin/downloads");
}

/** 批量开关 / 删除平台版本 */
export async function bulkPlatformAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const ids = String(fd.get("ids") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return;
  const op = String(fd.get("op") ?? "");

  if (op === "delete") {
    await deletePlatforms(ids);
  } else if (op === "enable" || op === "disable") {
    await togglePlatforms(ids, op === "enable");
  }
  await logAction("download.platform.bulk", `${ids.length} 项`, op);
  revalidatePath("/admin/downloads");
}

/** 改软件的显示名称（一次改掉该软件所有平台版本上的 resource_title） */
export async function setSoftwareTitleAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const contentId = Number(fd.get("contentId"));
  if (!contentId) return { error: "缺少软件 ID" };
  const title = String(fd.get("title") ?? "").trim();
  await setSoftwareTitle(contentId, title);
  await logAction("download.software.rename", title || `#${contentId}`, { contentId });
  revalidatePath("/admin/downloads");
  return { success: title ? "软件名称已更新" : "已恢复使用内容标题" };
}

/** 给某个平台版本添加一个镜像下载链接 */
export async function createMirrorAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const downloadId = Number(fd.get("downloadId") ?? 0);
  const name = String(fd.get("name") ?? "").trim();
  const url = String(fd.get("url") ?? "").trim();
  const r = await createMirror({
    downloadId,
    name,
    url,
    fileSize: String(fd.get("fileSize") ?? ""),
    note: String(fd.get("note") ?? ""),
    enabled: readSwitch(fd, "enabled"),
    sort: Number(fd.get("sort") ?? 0),
  });
  if (!r.ok) return { error: r.error ?? "保存失败" };
  await logAction("download.mirror.create", `${name} → ${url}`, { downloadId });
  revalidatePath("/admin/downloads");
  return { success: "镜像链接已添加" };
}

/** 修改镜像下载链接 */
export async function updateMirrorAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!id) return { error: "缺少镜像 ID" };
  const r = await updateMirror(id, {
    downloadId: Number(fd.get("downloadId") ?? 0) || undefined,
    name: String(fd.get("name") ?? ""),
    url: String(fd.get("url") ?? ""),
    fileSize: String(fd.get("fileSize") ?? ""),
    note: String(fd.get("note") ?? ""),
    enabled: readSwitch(fd, "enabled"),
    sort: Number(fd.get("sort") ?? 0),
  });
  if (!r.ok) return { error: r.error ?? "保存失败" };
  await logAction("download.mirror.update", `镜像 #${id}`);
  revalidatePath("/admin/downloads");
  return { success: "已保存" };
}

/** 删除镜像下载链接 */
export async function deleteMirrorAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!id) return;
  await deleteMirror(id);
  await logAction("download.mirror.delete", `镜像 #${id}`);
  revalidatePath("/admin/downloads");
}

/** 批量开关镜像链接 */
export async function bulkMirrorAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const ids = String(fd.get("ids") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return;
  const op = String(fd.get("op") ?? "");
  if (op === "enable" || op === "disable") {
    await toggleMirrors(ids, op === "enable");
    await logAction("download.mirror.bulk", `${ids.length} 项`, op);
    revalidatePath("/admin/downloads");
  }
}

/* ---------------------------------------------------------------- 设置 */

/**
 * 保存一组站点设置。
 * group 传分组名时只保存该分组的字段，避免整页保存互相覆盖。
 */
export async function saveSettingsAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();

  const group = String(fd.get("group") ?? "");
  const allowed = group
    ? new Set(fieldsOfGroup(group).map((f) => f.key))
    : new Set(Object.keys(SETTING_MAP));

  const data: Record<string, string> = {};
  for (const key of allowed) {
    // 开关类控件同时渲染了隐藏域（0）和复选框（1）：
    // 勾选时 FormData 里两个值都在（["0","1"]），未勾选时只有 ["0"]。
    // 直接取 get() 永远拿到隐藏域的 0，保存后开关就"恢复原样"了。
    // 这里改成取全部值，只要里面有 1 就算开启。
    if (SETTING_MAP[key]?.type === "switch") {
      const all = fd.getAll(key).map(String);
      if (all.includes("1")) data[key] = "1";
      else if (all.includes("0")) data[key] = "0";
      continue;
    }

    // 多选组：未勾选的一项都不会提交，所以取全部值拼成逗号串（空串 = 一个都没勾）
    if (SETTING_MAP[key]?.type === "checkboxes") {
      data[key] = fd.getAll(key).map(String).filter(Boolean).join(",");
      continue;
    }

    const v = fd.get(key);
    if (v === null) continue;
    // 表单里带文件字段时，FormData.get 会返回 File 对象，这里统一跳过。
    // 不直接用 instanceof File：部分 Node 运行时没有全局 File 构造函数。
    if (typeof File !== "undefined" && v instanceof File) continue;
    if (v && typeof v === "object" && "arrayBuffer" in v) continue;
    data[key] = String(v);
  }

  const r = await saveSettingValues(data);
  if (!r.ok) return { error: r.error ?? "保存失败" };

  resetSettingsCache();
  resetAssetBaseCache();
  // 改了壁纸设置要立刻生效：壁纸解析结果另有缓存，不清会继续用旧来源的图
  if (group === "wallpaper") resetWallpaperCache();
  await logAction("settings.save", group || "全部", r.saved);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/appearance");
  revalidatePath("/admin/seo");
  revalidatePath("/", "layout");
  return { success: `已保存 ${r.saved.length} 项设置` };
}

/** 单独保存一个设置项（开关类） */
export async function toggleSettingAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const key = String(fd.get("key") ?? "");
  const value = String(fd.get("value") ?? "");
  if (!key || !(key in SETTING_MAP)) return;
  await saveSettingValues({ [key]: value });
  resetSettingsCache();
  resetAssetBaseCache();
  await logAction("settings.toggle", key, value);
  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
}

/** 发送测试邮件（验证 SMTP 配置是否可用） */
export async function testMailAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const to = String(fd.get("to") ?? "").trim();
  if (!to) return { error: "请填写收件地址" };

  const cfg = await getMailConfig();
  if (!cfg.host || !cfg.user) {
    return { error: "尚未配置 SMTP 服务器与账号，请先保存上面的 SMTP 配置" };
  }

  const r = await sendNotifyMail(
    to,
    "管理员",
    "测试邮件",
    `这是一封来自 ${cfg.fromName} 的测试邮件。\n发送时间：${new Date().toLocaleString("zh-CN")}\n收到这封邮件说明 SMTP 配置可用。`
  );
  if (!r.ok) return { error: r.error ?? "发送失败" };
  await logAction("mail.test", to);
  return { success: `测试邮件已发送到 ${to}` };
}

/** 站点内容批量清理：清空旧的壁纸缓存等 */
export async function cleanupAction(): Promise<void> {
  await requireAdmin();
  await query("DELETE FROM knav_sessions WHERE expires_at < NOW()");
  await query("DELETE FROM knav_email_tokens WHERE expires_at < NOW() - INTERVAL 7 DAY");
  revalidatePath("/admin");
  redirect("/admin");
}
