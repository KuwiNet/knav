/**
 * 不同来源系统的表结构五花八门，适配器里统一用这几个小工具取值：
 * 列名可能是 name / title / sitename，时间可能是 Unix 秒或日期字符串。
 */

export type Row = Record<string, any>;

/** 链接表转成 site 内容时给 sourceId 加偏移，避免和文章主键撞车 */
export const LINK_SOURCE_OFFSET = 1_000_000_000;

export interface TableLike {
  name: string;
  rows: Row[];
}

export type TableMap = Map<string, TableLike>;

/** 按表名取行（大小写不敏感） */
export function tableRows(tables: TableMap, name: string): Row[] {
  const direct = tables.get(name);
  if (direct) return direct.rows;
  const lower = name.toLowerCase();
  for (const [key, t] of tables) {
    if (key.toLowerCase() === lower) return t.rows;
  }
  return [];
}

export function hasTable(tables: TableMap, name: string): boolean {
  if (tables.has(name)) return true;
  const lower = name.toLowerCase();
  for (const key of tables.keys()) {
    if (key.toLowerCase() === lower) return true;
  }
  return false;
}

/** 取第一个非空字段（列名不区分大小写） */
export function pick(row: Row, ...keys: string[]): string {
  if (!row) return "";
  const lower = new Map<string, any>();
  for (const [k, v] of Object.entries(row)) lower.set(k.toLowerCase(), v);
  for (const key of keys) {
    const v = lower.get(key.toLowerCase());
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

export function pickNum(row: Row, ...keys: string[]): number {
  const s = pick(row, ...keys);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** y/1/true/yes 都算真 */
export function pickFlag(row: Row, ...keys: string[]): boolean {
  const s = pick(row, ...keys).toLowerCase();
  return s === "y" || s === "1" || s === "true" || s === "yes";
}

/** 数字列入：`{1}{2}`、`1,2`、`1 2` 都能拆 */
export function idList(raw: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const m of raw.matchAll(/\d+/g)) {
    const n = Number(m[0]);
    if (n > 0 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** Unix 秒/毫秒 → MySQL DATETIME（按东八区展示，和站内 NOW() 一致） */
export function fromUnix(raw: any): string {
  let n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n > 1e12) n = Math.floor(n / 1000);
  if (n < 1e9) return "";
  const d = new Date(n * 1000 + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** 日期字段可能是 Unix 时间戳，也可能是 `2024-01-02 03:04:05` */
export function toDate(raw: any): string {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(s)) return s;
  if (/^\d{10,13}$/.test(s)) return fromUnix(s);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** 只接受真正的外部地址；补 `//` 协议，丢掉相对路径 */
export function cleanExternalUrl(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https:${s}`;
  return "";
}

/** 站点地址归一：去尾斜杠 */
export function siteBase(raw: string): string {
  const s = (raw ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return "";
  return s.replace(/\/+$/, "");
}

/** 选项表里按名称找值（Typecho/Halo/Emlog 的 options 列名各不相同） */
export function optionValue(rows: Row[], names: string[]): string {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const r of rows) {
    const key = pick(r, "option_name", "name", "option_key", "key", "conf_name").toLowerCase();
    if (!wanted.has(key)) continue;
    const v = pick(r, "option_value", "value", "conf_value");
    if (v) return v;
  }
  return "";
}

/** 链接类表判断：很多导航站直接叫 links / sites / bookmarks */
export function looksLikeLinkTable(name: string): boolean {
  const base = name.toLowerCase().split(".").pop() ?? name.toLowerCase();
  return (
    /(^|_)(links?|sites?|bookmarks?|navs?)$/.test(base) &&
    !/(post|comment|term|menu|navi$)/.test(base)
  );
}

/** 分类表判断 */
export function looksLikeCategoryTable(name: string): boolean {
  const base = name.toLowerCase().split(".").pop() ?? name.toLowerCase();
  return /(^|_)(link_?)?(categor(y|ies)|cats?|sorts?)$/.test(base);
}
