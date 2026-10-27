import { execute } from "./db";

/**
 * 内容 ↔ 分类关联。
 *
 * knav_contents.category_id 保留为「主分类」（列表、排序、面包屑用），
 * 一条内容的完整分类集合存在 knav_content_categories 里。
 * 投稿仍是单选，写回内容时只会产生一条关联。
 */

/** 用给定分类集合覆盖某条内容的分类关联 */
export async function replaceContentCategories(
  contentId: number,
  categoryIds: number[]
): Promise<void> {
  const ids = [...new Set(categoryIds.map(Number).filter((n) => n > 0))];
  await execute("DELETE FROM knav_content_categories WHERE content_id = ?", [
    contentId,
  ]);
  if (ids.length === 0) return;
  await execute(
    `INSERT IGNORE INTO knav_content_categories (content_id, category_id)
     VALUES ${ids.map(() => "(?,?)").join(",")}`,
    ids.flatMap((cid) => [contentId, cid])
  );
}

/** 把历史数据里只存了主分类的内容补进关联表（幂等） */
export async function backfillContentCategories(): Promise<number> {
  const res = await execute(
    `INSERT IGNORE INTO knav_content_categories (content_id, category_id)
     SELECT id, category_id FROM knav_contents WHERE category_id > 0`
  );
  return res.affectedRows;
}
