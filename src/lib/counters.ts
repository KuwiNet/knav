import { execute, query } from "./db";

/**
 * 冗余计数的刷新。
 *
 * knav_categories.content_count 与 knav_tags.count 是查询时用的冗余字段，
 * 内容增删改、分类调整、导入之后都要刷一次。
 */

/** 刷新分类的内容数（子分类的内容并入父分类） */
export async function refreshCategoryCounts(): Promise<void> {
  const rows = await query<{ id: number; parent_id: number }>(
    "SELECT id, parent_id FROM knav_categories"
  );
  if (rows.length === 0) return;

  const countRows = await query<{ category_id: number; n: number }>(
    `SELECT category_id, COUNT(DISTINCT id) AS n
       FROM (
         SELECT category_id, id FROM knav_contents
          WHERE status = 'publish' AND category_id > 0
         UNION
         SELECT cc.category_id, c.id
           FROM knav_content_categories cc
           JOIN knav_contents c ON c.id = cc.content_id AND c.status = 'publish'
       ) x
      GROUP BY category_id`
  );

  const direct = new Map<number, number>();
  for (const r of countRows) direct.set(Number(r.category_id), Number(r.n) || 0);

  const childrenOf = new Map<number, number[]>();
  for (const r of rows) {
    const parent = Number(r.parent_id) || 0;
    if (!parent) continue;
    const list = childrenOf.get(parent) ?? [];
    list.push(Number(r.id));
    childrenOf.set(parent, list);
  }

  const rolled = new Map<number, number>();
  const rollup = (id: number): number => {
    const cached = rolled.get(id);
    if (cached !== undefined) return cached;
    rolled.set(id, direct.get(id) ?? 0);
    let acc = direct.get(id) ?? 0;
    for (const child of childrenOf.get(id) ?? []) acc += rollup(child);
    rolled.set(id, acc);
    return acc;
  };

  const ids = rows.map((r) => Number(r.id));
  const params: any[] = [];
  const cases = ids
    .map((id) => {
      params.push(id, rollup(id));
      return "WHEN ? THEN ?";
    })
    .join(" ");
  await execute(
    `UPDATE knav_categories SET content_count = CASE id ${cases} ELSE content_count END
      WHERE id IN (${ids.map(() => "?").join(",")})`,
    [...params, ...ids]
  );
}

/** 刷新标签计数 */
export async function refreshTagCounts(): Promise<void> {
  await execute(
    `UPDATE knav_tags t SET count = (
       SELECT COUNT(*) FROM knav_content_tags ct
       JOIN knav_contents c ON c.id = ct.content_id AND c.status = 'publish'
       WHERE ct.tag_id = t.id
     )`
  );
}
