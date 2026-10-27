import zlib from "node:zlib";

/**
 * 读取本地 MySQL 备份文件（mysqldump / phpMyAdmin / Navicat 导出的 .sql）。
 *
 * 很多站只肯给一份「数据库备份文件」，不给开数据库端口，所以这里直接吃文件：
 *   - 支持 .sql、.sql.gz/.zip/.tar/.tar.gz（压缩包里的每个 .sql 都读一遍）
 *   - 只解析 WordPress / OneNav 那几张表（posts / postmeta / terms /
 *     term_taxonomy / term_relationships / termmeta / options），
 *     其它表（comments、统计插件的表…）扫到就跳过，不占内存
 *   - 解析出来的行全是字符串，跟 mysql2 的结果一起在 buildSnapshot 里归一化
 *
 * 不连库、不执行 SQL：只读语句文本，备份文件里的 DROP / UPDATE 一概不碰。
 */

/** 一张表：列名 + 行（按列名取值） */
export interface DumpTable {
  name: string;
  columns: string[];
  rows: Record<string, string | null>[];
  /** 没能解析出来的元组数（列数对不上），用来判断整份备份是不是读歪了 */
  skipped: number;
}

/** 解压后允许的最大文本量；再大建议直连源库扫描 */
const MAX_SQL_BYTES = 256 * 1024 * 1024;

/** 只收这几张表（前缀任意） */
const WANTED_TABLE = /_(?:posts|postmeta|terms|term_taxonomy|term_relationships|termmeta|options)$/i;

/* ------------------------------------------------------------ 文件解压 */

/**
 * 把上传的备份文件拆成若干份 SQL 文本。
 *
 * 靠文件头判断格式，不认扩展名（用户改过名的压缩包也得能读）。
 */
export function extractSqlText(buf: Buffer, filename: string): { name: string; sql: string }[] {
  if (buf.length === 0) throw new Error("文件是空的");

  const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
  const isZip = buf.readUInt32LE(0) === 0x04034b50 || buf.readUInt32LE(0) === 0x02014b50;
  const isTar = buf.length > 262 && buf.slice(257, 262).toString("ascii") === "ustar";

  if (isGzip) {
    let raw = buf;
    try {
      raw = zlib.gunzipSync(buf);
    } catch (e) {
      throw new Error(`gzip 解压失败：${(e as Error).message}`);
    }
    guardSize(raw, filename);
    // gzip 里通常就一份 .sql；直接当文本收
    return [{ name: filename.replace(/\.gz$/i, "") || filename, sql: raw.toString("utf8") }];
  }

  if (isZip) {
    const entries = readZip(buf);
    return keepSql(entries, filename);
  }

  if (isTar) {
    const entries = readTar(buf);
    return keepSql(entries, filename);
  }

  // 剩下按纯文本处理（.sql / .txt / 无扩展名）
  guardSize(buf, filename);
  const sql = buf.toString("utf8");
  if (!/\b(CREATE\s+TABLE|INSERT\s+INTO)\b/i.test(sql)) {
    throw new Error("文件里没找到 CREATE TABLE / INSERT INTO 语句，不像是 MySQL 备份");
  }
  return [{ name: filename || "backup.sql", sql }];
}

function keepSql(entries: { name: string; data: Buffer }[], filename: string) {
  const out: { name: string; sql: string }[] = [];
  for (const e of entries) {
    if (!/\.(sql|txt|dump)$/i.test(e.name)) continue;
    guardSize(e.data, e.name);
    const sql = e.data.toString("utf8");
    if (!/\b(CREATE\s+TABLE|INSERT\s+INTO)\b/i.test(sql)) continue;
    out.push({ name: e.name.split("/").pop() ?? e.name, sql });
  }
  if (out.length === 0) {
    throw new Error(`压缩包里没找到 .sql 文件（${filename}）`);
  }
  return out;
}

function guardSize(buf: Buffer, name: string): void {
  if (buf.length > MAX_SQL_BYTES) {
    throw new Error(
      `${name} 解压后有 ${(buf.length / 1024 / 1024).toFixed(0)}MB，超过 ${Math.round(
        MAX_SQL_BYTES / 1024 / 1024
      )}MB 上限；这种体量请用「MySQL 源库」直连扫描`
    );
  }
}

/** 极简 ZIP 读取：只用中央目录 + inflateRaw，够读备份包 */
function readZip(buf: Buffer): { name: string; data: Buffer }[] {
  let eocd = -1;
  const floor = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 4; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("压缩包里没找到目录结束标记，文件可能不完整");

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const out: { name: string; data: Buffer }[] = [];

  for (let n = 0; n < count; n++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const local = buf.readUInt32LE(ptr + 42);
    const name = buf.slice(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    ptr += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/") || compSize === 0xffffffff || local === 0xffffffff) {
      continue; // 目录 / zip64 条目（备份包不会用到）
    }
    const localNameLen = buf.readUInt16LE(local + 26);
    const localExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + localNameLen + localExtraLen;
    const raw = buf.slice(start, start + compSize);
    if (raw.length !== compSize) continue;
    if (method === 0) out.push({ name, data: raw });
    else if (method === 8) out.push({ name, data: zlib.inflateRawSync(raw) });
  }
  return out;
}

/** 极简 TAR 读取：512 字节头 + 八进制长度 */
function readTar(buf: Buffer): { name: string; data: Buffer }[] {
  const out: { name: string; data: Buffer }[] = [];
  let off = 0;
  while (off + 512 <= buf.length) {
    const head = buf.slice(off, off + 512);
    if (head.every((b) => b === 0)) break;

    const name = cstr(head, 0, 100);
    const prefix = cstr(head, 345, 155);
    const size = octal(head, 124, 12);
    const typeFlag = String.fromCharCode(head[156] || 0x30);
    const dataStart = off + 512;
    off = dataStart + Math.ceil(size / 512) * 512;

    if (typeFlag !== "0" && typeFlag !== "\0" && typeFlag !== "") continue;
    if (!name) continue;
    out.push({
      name: prefix ? `${prefix}/${name}` : name,
      data: buf.slice(dataStart, Math.min(dataStart + size, buf.length)),
    });
  }
  if (out.length === 0) throw new Error("压缩包里没找到普通文件");
  return out;
}

function cstr(buf: Buffer, start: number, len: number): string {
  const slice = buf.slice(start, start + len);
  const end = slice.indexOf(0);
  return (end < 0 ? slice : slice.slice(0, end)).toString("utf8").trim();
}

function octal(buf: Buffer, start: number, len: number): number {
  const s = cstr(buf, start, len).replace(/[^0-7]/g, "");
  const n = parseInt(s || "0", 8);
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------------------------------------ 语句切分 */

/**
 * 遍历一份 SQL 里的每条语句。
 *
 * 只把语句开头 240 个字符交出去做判断，命中要用的表才截取整条语句——
 * 一份几百 MB 的备份里，wp_comments 这类大表一次都不会被复制。
 */
function forEachStatement(
  sql: string,
  fn: (head: string, slice: () => string) => void
): void {
  const len = sql.length;
  let i = 0;
  let start = 0;

  const skipNoise = (from: number): number => {
    let p = from;
    for (;;) {
      while (p < len && /\s/.test(sql[p])) p++;
      if (sql[p] === "#" || (sql[p] === "-" && sql[p + 1] === "-")) {
        const nl = sql.indexOf("\n", p);
        p = nl < 0 ? len : nl + 1;
        continue;
      }
      if (sql[p] === "/" && sql[p + 1] === "*") {
        const close = sql.indexOf("*/", p + 2);
        p = close < 0 ? len : close + 2;
        continue;
      }
      return p;
    }
  };

  start = skipNoise(0);
  i = start;

  while (i < len) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === "`") {
      i = skipQuoted(sql, i);
      continue;
    }
    if (
      (c === "-" && sql[i + 1] === "-" && /[\s\x00-\x1f#]/.test(sql[i + 2] ?? " ")) ||
      c === "#" ||
      (c === "/" && sql[i + 1] === "*")
    ) {
      const after = skipNoise(i);
      // 注释在语句开头 → 挪动起点，别把注释文字算进语句
      if (after > start && sql.slice(start, i).trim() === "") start = after;
      i = after;
      continue;
    }
    if (c === ";") {
      const end = i;
      if (end > start) emit(sql, start, end, fn);
      i++;
      start = skipNoise(i);
      i = start;
      continue;
    }
    i++;
  }
  if (len > start && sql.slice(start).trim()) emit(sql, start, len, fn);
}

function emit(
  sql: string,
  start: number,
  end: number,
  fn: (head: string, slice: () => string) => void
): void {
  const head = sql.slice(start, Math.min(start + 240, end));
  fn(head, () => sql.slice(start, end));
}

/** 跳过一段引号内容，返回结束位置的下一位 */
function skipQuoted(sql: string, at: number): number {
  const q = sql[at];
  let i = at + 1;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "\\" && q !== "`") {
      i += 2;
      continue;
    }
    if (c === q) {
      if (sql[i + 1] === q) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return sql.length;
}

/* ------------------------------------------------------------ 语句解析 */

/** 解析一条 CREATE TABLE，拿到列名顺序 */
function parseCreate(head: string, full: () => string): { table: string; columns: string[] } | null {
  const m = /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[\]]?([\w$]+)[`"[\]]?/i.exec(head);
  if (!m) return null;
  const table = m[1];
  const text = full();
  const open = text.indexOf("(", m[0].length);
  if (open < 0) return { table, columns: [] };
  const body = balanced(text, open, ")");
  const columns: string[] = [];
  for (const part of splitTop(body, ",")) {
    const piece = part.trim();
    if (!piece) continue;
    // 第一个词就是列名（约束行的是 PRIMARY / KEY / CONSTRAINT 这些）
    const name = piece.split(/[\s([]/, 1)[0].replace(/[`"]/g, "");
    if (!name) continue;
    if (
      /^(primary|unique|key|index|constraint|foreign|fulltext|spatial|check|period|row_format|with|partition)/i.test(
        name
      )
    ) {
      continue;
    }
    columns.push(name);
  }
  return { table, columns };
}

/** 解析一条 INSERT / REPLACE，拿到表名、列名（可空）与值的起点 */
function parseInsert(
  head: string,
  full: () => string
): { table: string; columns: string[]; valuesAt: number; text: string } | null {
  const m =
    /^\s*(?:INSERT|REPLACE)\s+(?:LOW_PRIORITY\s+|DELAYED\s+|HIGH_PRIORITY\s+|IGNORE\s+)*INTO\s+[`"[\]]?([\w$]+)[`"[\]]?/i.exec(
      head
    );
  if (!m) return null;
  const table = m[1];
  const text = full();
  let p = m[0].length;

  // 可选的列清单
  let columns: string[] = [];
  const next = skipSpace(text, p);
  if (text[next] === "(") {
    const list = balanced(text, next, ")");
    columns = splitTop(list, ",")
      .map((s) => s.trim().replace(/[`"]/g, ""))
      .filter(Boolean);
    p = skipSpace(text, next + list.length + 2);
  }

  const kw = /^\s*values?\s+/i.exec(text.slice(p));
  if (!kw) return null; // INSERT ... SELECT 之类不处理
  return { table, columns, valuesAt: p + kw[0].length, text };
}

/** 把一条 INSERT 的值段解析成行 */
function readRows(
  text: string,
  from: number,
  columns: string[],
  table: DumpTable | undefined
): { rows: Record<string, string | null>[]; skipped: number } {
  const cols =
    columns.length > 0
      ? columns
      : table?.columns.length
        ? table.columns
        : [];
  const rows: Record<string, string | null>[] = [];
  if (cols.length === 0) return { rows, skipped: 0 };

  let skipped = 0;
  let i = from;
  while (i < text.length) {
    i = skipSpaceAndNoise(text, i);
    if (text[i] !== "(") break; // 值段结束（ON DUPLICATE KEY UPDATE / 语句尾巴）
    const close = balancedEnd(text, i, ")");
    if (close < 0) break;
    const parts = splitTop(text.slice(i + 1, close), ",");
    if (parts.length === cols.length) {
      const row: Record<string, string | null> = {};
      for (let c = 0; c < cols.length; c++) row[cols[c]] = parseValue(parts[c]);
      rows.push(row);
    } else {
      skipped++;
    }
    i = close + 1;
  }
  return { rows, skipped };
}

const ESCAPES: Record<string, string> = {
  "0": "\0",
  b: "\b",
  n: "\n",
  r: "\r",
  t: "\t",
  Z: "\x1a",
};

/** 单个值：NULL / 数字 / 十六进制 / 带转义的字符串 */
function parseValue(raw: string): string | null {
  let s = raw.trim();
  if (!s) return "";
  if (/^NULL$/i.test(s)) return null;

  // 字符集前缀：_utf8mb4'...' / _binary'...'
  const prefixed = /^_[a-z0-9_]+/i.exec(s);
  if (prefixed && s[prefixed[0].length] === "'") s = s.slice(prefixed[0].length);

  if (/^0x[0-9a-f]+$/i.test(s)) {
    return Buffer.from(s.slice(2), "hex").toString("utf8");
  }

  if (s[0] === "'" || s[0] === '"') return unquote(s, s[0]);

  return s;
}

/** 按 MySQL 的转义规则还原引号里的内容（\' \" \\ \n \r \t \0 \Z 与 '' 双写） */
function unquote(token: string, q: string): string {
  let out = "";
  for (let i = 1; i < token.length; i++) {
    const c = token[i];
    if (c === "\\" && i + 1 < token.length) {
      const next = token[++i];
      out += ESCAPES[next] ?? next;
      continue;
    }
    if (c === q) {
      if (token[i + 1] === q) {
        out += q;
        i++;
        continue;
      }
      break; // 收尾的那个引号
    }
    out += c;
  }
  return out;
}

/* ------------------------------------------------------------ 文本工具 */

function skipSpace(text: string, from: number): number {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

function skipSpaceAndNoise(text: string, from: number): number {
  let i = skipSpace(text, from);
  for (;;) {
    if (text[i] === "-" && text[i + 1] === "-") {
      const nl = text.indexOf("\n", i);
      i = skipSpace(text, nl < 0 ? text.length : nl + 1);
      continue;
    }
    if (text[i] === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      i = skipSpace(text, close < 0 ? text.length : close + 2);
      continue;
    }
    if (text[i] === ",") i = skipSpace(text, i + 1);
    return i;
  }
}

/** 取 open 处括号的内部内容 */
function balanced(text: string, open: number, closeChar: string): string {
  const end = balancedEnd(text, open, closeChar);
  return end < 0 ? text.slice(open + 1) : text.slice(open + 1, end);
}

/** 返回与 text[at] 这个左括号配对的右括号下标 */
function balancedEnd(text: string, at: number, closeChar: string): number {
  const openChar = text[at];
  let depth = 0;
  let i = at;
  while (i < text.length) {
    const c = text[i];
    if (c === "'" || c === '"' || c === "`") {
      i = skipQuoted(text, i);
      continue;
    }
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** 按顶层分隔符切开（括号与引号里的不算） */
function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "'" || c === '"' || c === "`") {
      i = skipQuoted(text, i);
      continue;
    }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  out.push(text.slice(start));
  return out;
}

/* ------------------------------------------------------------ 汇总 */

/**
 * 解析一份 SQL 文本，收齐 WordPress 那几张表。
 *
 * 同一个备份里可能有多套前缀（wp_ 与 wp_旧站_），前缀选择交给调用方。
 */
export function parseSqlDump(sql: string): Map<string, DumpTable> {
  const tables = new Map<string, DumpTable>();

  forEachStatement(sql, (head, slice) => {
    const isCreate = /^\s*CREATE\s+TABLE/i.test(head);
    const isInsert = /^\s*(?:INSERT|REPLACE)\s/i.test(head);
    if (!isCreate && !isInsert) return;

    if (isCreate) {
      const c = parseCreate(head, slice);
      if (!c || !WANTED_TABLE.test(c.table)) return;
      if (!tables.has(c.table)) {
        tables.set(c.table, { name: c.table, columns: c.columns, rows: [], skipped: 0 });
      } else if (c.columns.length > 0) {
        const hit = tables.get(c.table)!;
        if (hit.columns.length === 0) hit.columns = c.columns;
      }
      return;
    }

    const ins = parseInsert(head, slice);
    if (!ins || !WANTED_TABLE.test(ins.table)) return;
    let hit = tables.get(ins.table);
    if (!hit) {
      hit = { name: ins.table, columns: ins.columns, rows: [], skipped: 0 };
      tables.set(ins.table, hit);
    }
    if (hit.columns.length === 0 && ins.columns.length > 0) hit.columns = ins.columns;
    const parsed = readRows(ins.text, ins.valuesAt, ins.columns, hit);
    if (parsed.rows.length > 0) hit.rows.push(...parsed.rows);
    hit.skipped += parsed.skipped;
  });

  return tables;
}
