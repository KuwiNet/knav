"use server";

import { getCurrentUser } from "@/lib/auth";
import { toggleFavorite } from "@/lib/favorites";

/**
 * 切换收藏。
 * 未登录时返回 ok=false，前端据此引导到登录页。
 */
export async function toggleFavoriteAction(
  contentId: number
): Promise<{ ok: boolean; favorited?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return { ok: false, error: "内容 ID 无效" };
  }
  const favorited = await toggleFavorite(user.id, contentId);
  return { ok: true, favorited };
}
