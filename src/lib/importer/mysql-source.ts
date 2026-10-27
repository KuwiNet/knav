import type { Pool } from "mysql2/promise";
import { buildSnapshotFromTables } from "./adapters";
import {
  detectSourceSystem,
  SYSTEM_LABEL,
  unsupportedSourceMessage,
  wantedTables,
} from "./systems";
import { tableRows, type Row, type TableMap } from "./tables";
import { scanWordPress } from "./wordpress";
import type { ImportSnapshot } from "./types";

/**
 * 直连的 MySQL 源库 → 导入快照。
 *
 * 先读 information_schema 只拿表名和行数识别系统，再按该系统需要的表
 * SELECT *，不会去碰评论、日志之类的无关大表。
 */

const HALO2_MESSAGE =
  "检测到 Halo 2.x 的 extensions 表。Halo 2.x 把内容存成 JSON，暂不支持直接导入，请先在 Halo 后台导出 Markdown / 备份后再迁移。";

interface SourceTable {
  names: string[];
  counts: Record<string, number>;
}

async function listSourceTables(pool: Pool): Promise<SourceTable> {
  const [rows] = await pool.query<any[]>(
    `SELECT TABLE_NAME AS name, TABLE_ROWS AS row_count
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
  );
  const names: string[] = [];
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const name = String(r.name ?? "");
    if (!name) continue;
    names.push(name);
    counts[name] = Number(r.row_count) || 0;
  }
  return { names, counts };
}

function quoteId(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

async function loadTables(pool: Pool, names: string[]): Promise<TableMap> {
  const tables: TableMap = new Map();
  for (const name of names) {
    const [rows] = await pool.query<any[]>(`SELECT * FROM ${quoteId(name)}`);
    tables.set(name, { name, rows: rows as Row[] });
  }
  return tables;
}

export async function scanDatabase(
  pool: Pool,
  opts: { sourceLabel?: string; tablePrefix?: string } = {}
): Promise<ImportSnapshot> {
  const { names, counts } = await listSourceTables(pool);
  const det = detectSourceSystem(names, opts.tablePrefix ?? "", counts);

  if (det.system === "halo2") throw new Error(HALO2_MESSAGE);
  if (det.system === "unknown") throw new Error(unsupportedSourceMessage(names));

  if (det.system === "wordpress") {
    return scanWordPress(pool, {
      sourceLabel: opts.sourceLabel,
      prefix: det.prefix,
    });
  }

  const wanted = wantedTables(det, names);
  const tables = await loadTables(pool, wanted);
  const snapshot = buildSnapshotFromTables(det, tables, {
    sourceLabel: opts.sourceLabel,
  });

  if (snapshot.contents.length === 0) {
    const empty = wanted
      .filter((name) => tableRows(tables, name).length === 0)
      .slice(0, 6);
    throw new Error(
      `认出来是 ${SYSTEM_LABEL[det.system]}，但没有读到可导入的内容。` +
        (empty.length > 0 ? `（${empty.join("、")} 是空表）` : "")
    );
  }
  return snapshot;
}
