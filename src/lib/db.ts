// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  require("server-only");
}
import mysql from "mysql2/promise";

/**
 * 数据库连接池。
 *
 * knav 用自己的表（前缀 knav_），连接信息全部来自环境变量，
 * 不再直连任何 WordPress 库——老站数据走「数据迁移」导入。
 */

const globalForDb = globalThis as unknown as { kwPool?: mysql.Pool };

function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "knav_dev",
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
    queueLimit: 0,
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
    // 关闭 dateStrings 让 DATETIME 以本地可读格式返回
    dateStrings: true,
  });
}

export const pool: mysql.Pool = globalForDb.kwPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.kwPool = pool;
}

/** 查询多行 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

/** 查询单行，无结果返回 null */
export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** 执行写操作，返回 affectedRows / insertId */
export async function execute(
  sql: string,
  params: any[] = []
): Promise<{ affectedRows: number; insertId: number }> {
  const [res] = await pool.query(sql, params);
  const r = res as mysql.ResultSetHeader;
  return { affectedRows: r.affectedRows, insertId: r.insertId };
}

/** 事务包装 */
export async function transaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 外部数据源的连接。
 *
 * 「数据迁移」里填的源库信息（host / 库名 / 账号）用这里单独建连接，
 * 与本站连接池互不影响，导入完直接关掉。
 */
export async function createExternalPool(cfg: {
  host: string;
  port?: number;
  user: string;
  password?: string;
  database: string;
  ssl?: boolean;
}): Promise<mysql.Pool> {
  return mysql.createPool({
    host: cfg.host,
    port: Number(cfg.port || 3306),
    user: cfg.user,
    password: cfg.password ?? "",
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0,
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
    dateStrings: true,
    ssl: cfg.ssl ? {} : undefined,
  });
}
