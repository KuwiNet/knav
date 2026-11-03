/** 查看当前账号的权限 */
import "./load-env";
import mysql from "mysql2/promise";
import { dbConfig } from "../src/lib/db-config";

async function main() {
  const conn = await mysql.createConnection({ ...dbConfig() });
  const [g] = await conn.query("SHOW GRANTS FOR CURRENT_USER()");
  console.log((g as any[]).map((r) => Object.values(r)[0]).join("\n"));
  await conn.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
