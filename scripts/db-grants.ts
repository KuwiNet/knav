/** 查看当前账号的权限 */
import "./load-env";
import mysql from "mysql2/promise";

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "knav_dev",
  });
  const [g] = await conn.query("SHOW GRANTS FOR CURRENT_USER()");
  console.log((g as any[]).map((r) => Object.values(r)[0]).join("\n"));
  await conn.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
