import { query, queryOne, execute } from "./db";
import { getCurrentUser } from "./auth";

/**
 * 用户收藏。
 *
 * 收藏记录落在自研表 knav_favorites（user_id + content_id 唯一），
 * content_id 指向 knav_contents.id，因此网址收藏、文章、下载都能收藏。
 */

export interface FavoriteState {
  /** 是否已登录 */
  loggedIn: boolean;
  /** 已收藏的 content_id 列表 */
  ids: number[];
}

/** 读取当前用户的收藏状态 */
export async function getFavoriteState(): Promise<FavoriteState> {
  const user = await getCurrentUser();
  if (!user) return { loggedIn: false, ids: [] };
  const ids = await listFavoriteIds(user.id);
  return { loggedIn: true, ids };
}

/** 读取某用户收藏的 content_id 列表 */
export async function listFavoriteIds(userId: number): Promise<number[]> {
  const rows = await query<{ content_id: number }>(
    "SELECT content_id FROM knav_favorites WHERE user_id = ? ORDER BY created_at DESC",
    [userId]
  );
  return rows.map((r) => Number(r.content_id));
}

/** 某用户的收藏条数（用户概览卡片用） */
export async function countFavorites(userId: number): Promise<number> {
  const row = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM knav_favorites WHERE user_id = ?",
    [userId]
  );
  return Number(row?.n) || 0;
}

/**
 * 切换收藏状态。
 * 返回切换后的状态：true 表示现在处于「已收藏」。
 */
export async function toggleFavorite(
  userId: number,
  contentId: number
): Promise<boolean> {
  const existing = await query<{ id: number }>(
    "SELECT id FROM knav_favorites WHERE user_id = ? AND content_id = ? LIMIT 1",
    [userId, contentId]
  );
  if (existing.length > 0) {
    await execute("DELETE FROM knav_favorites WHERE user_id = ? AND content_id = ?", [
      userId,
      contentId,
    ]);
    return false;
  }
  await execute(
    "INSERT INTO knav_favorites (user_id, content_id) VALUES (?,?)",
    [userId, contentId]
  );
  return true;
}
