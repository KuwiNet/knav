/**
 * 创建或重置管理员账号（本地开发 / 首次部署用）。
 *
 * 用法：
 *   npx tsx scripts/create-admin.ts <用户名> <邮箱> <密码>
 *
 * 例：npx tsx scripts/create-admin.ts admin admin@example.com Admin@12345
 */
import "./load-env";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

async function main() {
  const [username, email, password] = process.argv.slice(2);
  if (!username || !email || !password) {
    console.error("用法: npx tsx scripts/create-admin.ts <用户名> <邮箱> <密码>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("密码至少 8 位");
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "knav_dev",
  });

  const hash = await bcrypt.hash(password, 12);
  const [rows] = await conn.query("SELECT id FROM knav_users WHERE username = ? LIMIT 1", [
    username,
  ]);
  // 第一个管理员自动成为站长（唯一）；已经有站长时只建普通管理员
  const [owners] = await conn.query("SELECT id FROM knav_users WHERE role = 'owner' LIMIT 1");
  const hasOwner = (owners as any[]).length > 0;

  if ((rows as any[]).length > 0) {
    const id = (rows as any[])[0].id;
    await conn.query(
      "UPDATE knav_users SET email = ?, password_hash = ?, status = 'active', email_verified_at = NOW() WHERE id = ?",
      [email, hash, id]
    );
    if (!hasOwner) {
      await conn.query("UPDATE knav_users SET role = 'owner' WHERE id = ?", [id]);
    }
    console.log(`已重置管理员账号: ${username} (id=${id})${hasOwner ? "" : "，并设为站长"}`);
  } else {
    const role = hasOwner ? "admin" : "owner";
    const [res] = await conn.query(
      "INSERT INTO knav_users (username, email, password_hash, nickname, role, status, email_verified_at) VALUES (?,?,?,?,?,'active',NOW())",
      [username, email, hash, username, role]
    );
    console.log(
      `已创建管理员账号: ${username} (id=${(res as any).insertId})${hasOwner ? "" : "，并设为站长"}`
    );
  }

  await conn.end();
}

void crypto;
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
