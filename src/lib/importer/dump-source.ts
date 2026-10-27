import { buildSnapshotFromTables } from "./adapters";
import { extractSqlText, listDumpTables, parseSqlDump, type DumpTable } from "./sql-dump";
import {
  detectSourceSystem,
  SYSTEM_LABEL,
  unsupportedSourceMessage,
  wantedTables,
} from "./systems";
import { buildSnapshot, type WpDataset, type WpRow } from "./wordpress";
import type { ImportSnapshot } from "./types";

/**
 * 本地 MySQL 备份文件 → 导入快照。
 *
 * 先只扫表名识别系统（knav / WordPress / Typecho / Z-BlogPHP / Emlog / Halo /
 * 通用 links 导航库），再按该系统需要的表做第二遍解析。
 * WordPress 可能一个备份里有多套前缀（wp_ 与 wp_旧站_），仍按内容最多的那套走。
 */

const WP_SUFFIXES = {
  posts: "posts",
  postmeta: "postmeta",
  terms: "terms",
  termTaxonomy: "term_taxonomy",
  termRelationships: "term_relationships",
  termMeta: "termmeta",
  options: "options",
} as const;

export function scanSqlDumpFile(
  buf: Buffer,
  filename: string,
  opts: { tablePrefix?: string } = {}
): ImportSnapshot {
  const files = extractSqlText(buf, filename);

  const names: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    for (const name of listDumpTables(f.sql)) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }

  const det = detectSourceSystem(names, opts.tablePrefix ?? "");

  if (det.system === "halo2") {
    throw new Error(
      "检测到 Halo 2.x 的 extensions 表。Halo 2.x 把内容存成 JSON，暂不支持直接导入，请先在 Halo 后台导出 Markdown / 备份后再迁移。"
    );
  }
  if (det.system === "unknown") {
    throw new Error(unsupportedSourceMessage(names));
  }

  if (det.system === "wordpress") {
    return scanWordPressDump(files, filename, det.prefix);
  }

  const wanted = new Set(wantedTables(det, names).map((n) => n.toLowerCase()));
  const tables = new Map<string, DumpTable>();
  for (const f of files) {
    for (const [name, t] of parseSqlDump(f.sql, { wanted: (n) => wanted.has(n.toLowerCase()) })) {
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

  const snapshot = buildSnapshotFromTables(det, tables, { sourceLabel: filename });
  if (snapshot.contents.length === 0) {
    throw new Error(
      `认出来是 ${SYSTEM_LABEL[det.system]}，但没有读到可导入的内容。` +
        explainSkipped(tables)
    );
  }
  return snapshot;
}

/** WordPress 备份：保留「多套前缀里挑内容最多」的老行为 */
function scanWordPressDump(
  files: { name: string; sql: string }[],
  filename: string,
  detectedPrefix: string
): ImportSnapshot {
  const tables = new Map<string, DumpTable>();
  const wpWanted = (name: string) => {
    const n = name.toLowerCase();
    if (/_(posts|postmeta|terms|term_taxonomy|term_relationships|termmeta|options)$/.test(n)) {
      return true;
    }
    return /^(posts|postmeta|terms|term_taxonomy|term_relationships|termmeta|options)$/.test(n);
  };

  for (const f of files) {
    for (const [name, t] of parseSqlDump(f.sql, { wanted: wpWanted })) {
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

  const prefix = pickPrefix(tables, detectedPrefix);
  const of = (suffix: string): WpRow[] =>
    (tables.get(`${prefix}${suffix}`)?.rows ?? []) as WpRow[];

  const posts = of(WP_SUFFIXES.posts);
  const postsTable = tables.get(`${prefix}${WP_SUFFIXES.posts}`);
  if (posts.length === 0) {
    if (postsTable && postsTable.skipped > 0) {
      throw new Error(
        `读到了 ${prefix}posts 的 INSERT 语句，但 ${postsTable.skipped} 组值的列数对不上，解析不出来`
      );
    }
    throw new Error(
      `备份里认出了 WordPress 的表，但没有找到 ${prefix}posts 的内容行。` +
        explainSkipped(tables)
    );
  }

  const dataset: WpDataset = {
    prefix,
    posts,
    postmeta: of(WP_SUFFIXES.postmeta),
    terms: of(WP_SUFFIXES.terms),
    termTaxonomy: of(WP_SUFFIXES.termTaxonomy),
    termRelationships: of(WP_SUFFIXES.termRelationships),
    termMeta: of(WP_SUFFIXES.termMeta),
    options: of(WP_SUFFIXES.options),
  };

  return buildSnapshot(dataset, { sourceLabel: filename });
}

/** 多套前缀时挑 posts 行数最多的；并列取探测结果 / 名字短的 */
function pickPrefix(tables: Map<string, DumpTable>, detected: string): string {
  const candidates: { prefix: string; count: number }[] = [];
  for (const [name, t] of tables) {
    if (!/posts$/i.test(name)) continue;
    candidates.push({ prefix: name.replace(/posts$/i, ""), count: t.rows.length });
  }
  if (candidates.length === 0) return detected || "wp_";
  candidates.sort(
    (a, b) =>
      b.count - a.count ||
      (a.prefix === detected ? -1 : b.prefix === detected ? 1 : 0) ||
      a.prefix.length - b.prefix.length
  );
  return candidates[0].prefix;
}

function explainSkipped(tables: Map<string, DumpTable>): string {
  const skipped = [...tables.values()].filter((t) => t.skipped > 0);
  if (skipped.length === 0) return "";
  return `（有 ${skipped.reduce((n, t) => n + t.skipped, 0)} 组值的列数对不上，可能是备份不完整）`;
}
