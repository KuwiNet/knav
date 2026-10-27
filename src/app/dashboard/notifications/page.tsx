import Link from "next/link";
import { getCurrentUser, listNotifications } from "@/lib/auth";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/lib/actions/auth-actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = (await getCurrentUser())!;
  const notices = await listNotifications(user.id, 100);
  const unread = notices.filter((n) => !n.isRead).length;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          通知
        </h1>
        {unread > 0 ? (
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className="btn btn-outline btn-sm">
              全部标记为已读
            </button>
          </form>
        ) : null}
      </div>
      <p className="page-sub">
        共 {notices.length} 条通知{unread > 0 ? `，${unread} 条未读` : ""}。审核结果同时会发送到注册邮箱。
      </p>

      {notices.length === 0 ? (
        <div className="card card-pad">
          <div className="empty">
            <div className="empty-title">暂时没有通知</div>
            <div className="text-sm">投稿审核结果、账号安全提醒都会出现在这里。</div>
          </div>
        </div>
      ) : (
        <div className="card card-pad">
          <ul className="aside-list">
            {notices.map((n) => (
              <li
                key={n.id}
                className="aside-link"
                style={{ display: "block", padding: "12px 0" }}
              >
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  {!n.isRead ? <span className="badge badge-accent">未读</span> : null}
                  <strong style={{ fontSize: 14.5 }}>{n.title}</strong>
                  <span className="text-muted text-sm" style={{ marginLeft: "auto" }}>
                    {String(n.createdAt).slice(0, 16)}
                  </span>
                </div>
                <div className="text-muted" style={{ marginTop: 4, fontSize: 14 }}>
                  {n.body}
                </div>
                <div className="row" style={{ gap: 10, marginTop: 8 }}>
                  {n.link ? (
                    <Link href={n.link} className="btn btn-sm">
                      查看详情
                    </Link>
                  ) : null}
                  {!n.isRead ? (
                    <form action={markNotificationReadAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="btn btn-ghost btn-sm">
                        标记已读
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
