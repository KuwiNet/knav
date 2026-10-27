import "./load-env";
import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";

/**
 * 清空并重建数据库。
 *
 * 会 DROP 目标库里的所有表再按 db/schema.sql 重建——
 * 用户的旧数据从此只能通过「数据迁移」重新导入，所以先备份再执行。
 *
 * 用法:
 *   npx tsx scripts/db-reset.ts --yes
 */

const cfg = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "knav_dev",
};

const CONFIRMED = process.argv.includes("--yes");

async function main() {
  if (!CONFIRMED) {
    console.error(
      `这会清空数据库 ${cfg.database} 的全部表。确认请加 --yes：\n  npx tsx scripts/db-reset.ts --yes`
    );
    process.exit(1);
  }

  const conn = await mysql.createConnection({ ...cfg, multipleStatements: true });

  const [tables] = await conn.query(
    `SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
    [cfg.database]
  );
  const list = tables as any[];
  for (const r of list) {
    await conn.query(`DROP TABLE IF EXISTS \`${r.t}\``);
  }
  console.log(`已删除 ${list.length} 张表`);

  const sql = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await conn.query(sql);
  console.log("已按 db/schema.sql 重建表结构");

  const [after] = await conn.query(
    `SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name`,
    [cfg.database]
  );
  console.log("当前表:");
  for (const r of after as any[]) console.log(`  ${r.t}`);

  await conn.end();
}

main().catch((e) => {
  console.error("重置失败:", e.message);
  process.exit(1);
});
