import "./load-env";
import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";

/**
 * 建表：执行 db/schema.sql，并补齐旧库缺失的列。
 *
 * knav 的表结构以 db/schema.sql 为准，CREATE TABLE IF NOT EXISTS 不会改动已存在的表，
 * 所以结构升级要在这里写幂等 ALTER（先查 information_schema 再改）。
 *
 * 用法: npx tsx scripts/migrate.ts
 */
async function main() {
  const host = process.env.DB_HOST || "127.0.0.1";
  const port = Number(process.env.DB_PORT || 3307);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASS || "";
  const db = process.env.DB_NAME || "knav_dev";

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database: db,
    multipleStatements: true,
  });
  const sql = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await conn.query(sql);

  await ensureColumns(conn, db);

  const [tables] = await conn.query(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
    [db]
  );
  console.log(`迁移完成: ${db}`);
  console.log("当前表:");
  for (const r of tables as any[]) console.log(`  ${r.t}`);
  await conn.end();
}

/** 取某个 ENUM 列当前的类型定义 */
async function columnType(
  conn: mysql.Connection,
  db: string,
  table: string,
  column: string
): Promise<string> {
  const [rows] = await conn.query<any[]>(
    `SELECT COLUMN_TYPE AS t FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
    [db, table, column]
  );
  return String(rows[0]?.t ?? "");
}

async function ensureColumns(conn: mysql.Connection, db: string): Promise<void> {
  /* 站长角色：老库的 role 是 ENUM('user','editor','admin')，补上 owner */
  const roleType = await columnType(conn, db, "knav_users", "role");
  if (roleType && !roleType.includes("'owner'")) {
    await conn.query(
      "ALTER TABLE knav_users MODIFY COLUMN role ENUM('user','editor','admin','owner') NOT NULL DEFAULT 'user' COMMENT 'owner=站长（唯一，可转移）'"
    );
    console.log("已为 knav_users.role 增加 owner");
  }

  /* 站点重置验证码：令牌用途加 site_reset */
  const purposeType = await columnType(conn, db, "knav_email_tokens", "purpose");
  if (purposeType && !purposeType.includes("'site_reset'")) {
    await conn.query(
      "ALTER TABLE knav_email_tokens MODIFY COLUMN purpose ENUM('verify','reset_password','change_email','site_reset') NOT NULL"
    );
    console.log("已为 knav_email_tokens.purpose 增加 site_reset");
  }

  /* 至少保证有一个站长：升级老库时把最早的管理员提升为站长 */
  const [owners] = await conn.query<any[]>(
    "SELECT id FROM knav_users WHERE role = 'owner' LIMIT 1"
  );
  if ((owners as any[]).length === 0) {
    const [admins] = await conn.query<any[]>(
      "SELECT id, username FROM knav_users WHERE role = 'admin' ORDER BY id ASC LIMIT 1"
    );
    if ((admins as any[]).length > 0) {
      const a = (admins as any[])[0];
      await conn.query("UPDATE knav_users SET role = 'owner' WHERE id = ?", [a.id]);
      console.log(`已把管理员 #${a.id}（${a.username}）提升为站长`);
    }
  }

  /* 多分类：把历史内容的主分类补进关联表（幂等） */
  const [backfill] = await conn.query<any>(
    `INSERT IGNORE INTO knav_content_categories (content_id, category_id)
     SELECT id, category_id FROM knav_contents WHERE category_id > 0`
  );
  const added = Number((backfill as any).affectedRows) || 0;
  if (added > 0) {
    console.log(`已为 ${added} 条内容补齐分类关联`);
  }
}

main().catch((e) => {
  console.error("迁移失败:", e.message);
  process.exit(1);
});
