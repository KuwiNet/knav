"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createSubmission, withdrawSubmission } from "@/lib/submissions";
import { fetchSiteMeta } from "@/lib/site-fetch";
import { assertPublicHttpUrl } from "@/lib/url-guard";
import type { FormState } from "./types";

/**
 * 投稿相关 Server Actions。
 */

/** 提交投稿 */
export async function submitAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录后再投稿" };
  if (!user.emailVerified) return { error: "邮箱尚未验证，暂时无法投稿" };

  const type = String(fd.get("type") ?? "site");
  const title = String(fd.get("title") ?? "").trim();
  const url = String(fd.get("url") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim();
  const contentMd = String(fd.get("contentMd") ?? "");
  const cover = String(fd.get("cover") ?? "").trim();
  const categoryId = Number(fd.get("categoryId") ?? 0);
  const tags = String(fd.get("tags") ?? "").trim();

  if (type !== "site" && type !== "article") {
    return { error: "请选择投稿类型" };
  }

  const r = await createSubmission(user.id, {
    type,
    title,
    url,
    description,
    contentMd,
    cover,
    categoryId,
    tags,
  });

  if (!r.ok) return { error: r.error };

  revalidatePath("/dashboard/submissions");
  return {
    success: "投稿已提交，审核通过后会自动发布。审核结果会通过邮件通知你。",
  };
}

/** 撤回投稿 */
export async function withdrawSubmissionAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = Number(fd.get("id"));
  if (!id) return;
  await withdrawSubmission(id, user.id);
  revalidatePath("/dashboard/submissions");
}

/** 抓取结果 */
export interface SubmitMetaResult {
  ok: boolean;
  error?: string;
  title?: string;
  description?: string;
  icon?: string;
  cover?: string;
}

/** 同一用户两次抓取的最小间隔，免得拿这个接口当外发洪水器 */
const FETCH_COOLDOWN_MS = 3000;
const lastFetchAt = new Map<number, number>();

/**
 * 投稿页的「获取信息」。
 *
 * 与后台那个同名功能共用 site-fetch 的解析逻辑，但这是登录用户就能调的入口，
 * 服务器会替他去访问一个由用户指定的地址，所以必须先过 url-guard 的内网判定，
 * 再加一层按用户的冷却时间。
 */
export async function fetchSubmitMetaAction(
  rawUrl: string
): Promise<SubmitMetaResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const last = lastFetchAt.get(user.id) ?? 0;
  if (Date.now() - last < FETCH_COOLDOWN_MS) {
    return { ok: false, error: "抓取太频繁，稍等一下再试" };
  }
  lastFetchAt.set(user.id, Date.now());

  const guard = await assertPublicHttpUrl(rawUrl);
  if (!guard.ok) return { ok: false, error: guard.error };

  const r = await fetchSiteMeta(guard.url);
  if (!r.ok) return { ok: false, error: r.error };

  // 跳转可能把请求带到内网，取回的真实地址再判一次
  const finalGuard = await assertPublicHttpUrl(r.meta.finalUrl);
  if (!finalGuard.ok) return { ok: false, error: "目标站点跳转到了内网地址，已拒绝" };

  const { title, description, icon, cover } = r.meta;
  return { ok: true, title, description, icon, cover };
}
