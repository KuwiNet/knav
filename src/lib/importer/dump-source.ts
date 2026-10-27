import { extractSqlText, parseSqlDump, type DumpTable } from "./sql-dump";
import { buildSnapshot, type WpDataset, type WpRow } from "./wordpress";
import type { ImportSnapshot } from "./types";

/**
 * 本地 MySQL 备份文件 → 导入快照。
 *
 * 备份文件里的表名带各种前缀（wp_、onenav_、site2022_），
 * 也可能一次打包了好几套（分库导出），所以先把 WordPress 那几张表收齐，
 * 再挑出内容最多的那套前缀拼成 WpDataset，跟直连源库走同一个映射。
 */

/** 逻辑表名 → WordPress 里的表名后缀 */
const SUFIXES = {
  posts: "posts",
  postmeta: "postmeta",
  terms: "terms",
  termTaxonomy: "term_taxonomy",
  termRelationships: "term_relationships",
  termMeta: "termmeta",
  options: "options",
} as const;

export function scanSqlDumpFile(buf: Buffer, filename: string): ImportSnapshot {
  const files = extractSqlText(buf, filename);

  const tables = new Map<string, DumpTable>();
  for (const f of files) {
    for (const [name, t] of parseSqlDump(f.sql)) {
      const hit = tables.get(name);
      if (!hit) {
        tables.set(name, t);
        continue;
      }
      hit.rows.push(...t.rows);
      hit.skipped += t.skipped;
      if (hit.columns.length === 0) hit.columns = t.columns;
    }
  }

  const prefix = pickPrefix(tables);
  const of = (suffix: string): WpRow[] =>
    (tables.get(`${prefix}${suffix}`)?.rows ?? []) as WpRow[];

  const posts = of(SUFIXES.posts);
  const postsTable = tables.get(`${prefix}${SUFIXES.posts}`);
  if (posts.length === 0) {
    const parsed = [...tables.keys()];
    if (postsTable && postsTable.skipped > 0) {
      throw new Error(
        `读到了 ${prefix}posts 的 INSERT 语句，但 ${postsTable.skipped} 组值的列数对不上，解析不出来`
      );
    }
    throw new Error(
      parsed.length === 0
        ? "备份文件里没找到 WordPress/OneNav 的表（posts / terms 这些），确认导出了数据库内容"
        : `备份里读到了 ${parsed.length} 张表（如 ${parsed.slice(0, 3).join("、")}），但没有可用的 *_posts 数据`
    );
  }

  const dataset: WpDataset = {
    prefix,
    posts,
    postmeta: of(SUFIXES.postmeta),
    terms: of(SUFIXES.terms),
    termTaxonomy: of(SUFIXES.termTaxonomy),
    termRelationships: of(SUFIXES.termRelationships),
    termMeta: of(SUFIXES.termMeta),
    options: of(SUFIXES.options),
  };

  return buildSnapshot(dataset, { sourceLabel: filename });
}

/** 挑内容最多的那套表前缀（并列时取名字短的，跟直连探测的规则一致） */
function pickPrefix(tables: Map<string, DumpTable>): string {
  const candidates: { prefix: string; count: number }[] = [];
  for (const [name, t] of tables) {
    if (!/_posts$/i.test(name)) continue;
    candidates.push({ prefix: name.replace(/posts$/i, ""), count: t.rows.length });
  }
  if (candidates.length === 0) return "wp_";
  candidates.sort((a, b) => b.count - a.count || a.prefix.length - b.prefix.length);
  return candidates[0].prefix;
}
