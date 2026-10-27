// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  require("server-only");
}
import { query, execute } from "./db";
import { getCurrentUser } from "./auth";

/**
 * 后台操作日志。
 *
 * 记录"谁在什么时候改了什么"，出问题时能回溯。
 * 写日志失败不影响主流程。
 */

export interface AdminLogRow {
  id: number;
  userId: number;
  username: string;
  action: string;
  target: string;
  detail: string;
  ip: string;
  createdAt: string;
}

/** 记录一条操作 */
export async function logAction(
  action: string,
  target = "",
  detail: unknown = ""
): Promise<void> {
  try {
    const user = await getCurrentUser();
    const text =
      typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "";
    await execute(
      `INSERT INTO knav_admin_log (user_id, username, action, target, detail)
       VALUES (?,?,?,?,?)`,
      [user?.id ?? 0, user?.username ?? "", action, target.slice(0, 250), text]
    );
  } catch {
    /* 日志失败不影响主流程 */
  }
}

/** 读取操作日志 */
export async function listAdminLogs(opts: {
  limit?: number;
  offset?: number;
  action?: string;
} = {}): Promise<{ items: AdminLogRow[]; total: number }> {
  const { limit = 30, offset = 0, action } = opts;
  const where = action ? "WHERE action = ?" : "";
  const params = action ? [action] : [];
  const rows = await query<any>(
    `SELECT id, user_id, username, action, target, detail, ip, created_at
     FROM knav_admin_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const totalRows = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM knav_admin_log ${where}`,
    params
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      userId: Number(r.user_id) || 0,
      username: r.username ?? "",
      action: r.action ?? "",
      target: r.target ?? "",
      detail: r.detail ?? "",
      ip: r.ip ?? "",
      createdAt: r.created_at ?? "",
    })),
    total: Number(totalRows[0]?.n) || 0,
  };
}

/** 清理旧日志 */
export async function trimAdminLogs(keepDays = 90): Promise<number> {
  const days = Math.max(1, Math.min(3650, Math.floor(keepDays)));
  const res = await execute(
    `DELETE FROM knav_admin_log WHERE created_at < NOW() - INTERVAL ${days} DAY`
  );
  return res.affectedRows;
}
