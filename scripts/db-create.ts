/**
 * 创建本地开发库 knav_dev（供导入 WordPress 导出的 SQL 使用）
 * 用法: npx tsx scripts/db-create.ts
 */
import "./load-env";
import mysql from "mysql2/promise";

const admin = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
};

const DB_NAME = process.env.DB_NAME || "knav_dev";

async function main() {
  const conn = await mysql.createConnection(admin);
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`数据库 ${DB_NAME} 已就绪`);
  } catch (e: any) {
    console.error("创建失败:", e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
