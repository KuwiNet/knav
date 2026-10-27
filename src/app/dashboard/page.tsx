import Link from "next/link";
import {
  getCurrentUser,
  listNotifications,
  notificationCount,
  unreadCount,
} from "@/lib/auth";
import { countFavorites } from "@/lib/favorites";
import { countSubmissionsByStatus } from "@/lib/submissions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = (await getCurrentUser())!;
  const [stats, notices, unread, noticesTotal, favorites] = await Promise.all([
    countSubmissionsByStatus(user.id),
    listNotifications(user.id, 5),
    unreadCount(user.id),
    notificationCount(user.id),
    countFavorites(user.id),
  ]);

  const cards = [
    { label: "投稿总数", value: stats.total, href: "/dashboard/submissions" },
    { label: "待审核", value: stats.pending, href: "/dashboard/submissions" },
    { label: "已通过", value: stats.approved, href: "/dashboard/submissions" },
    { label: "未通过", value: stats.rejected, href: "/dashboard/submissions" },
    { label: "站内通知", value: noticesTotal, href: "/dashboard/notifications" },
    { label: "我的收藏", value: favorites, href: "/dashboard/favorites" },
  ];

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        你好，{user.nickname || user.username}
      </h1>
      <p className="page-sub">
        欢迎回来。这里可以管理投稿、查看通知与账号设置。
      </p>

      <div className="grid grid-lg" style={{ marginBottom: 22 }}>
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card card-pad">
            <div className="text-muted text-sm">{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 680, marginTop: 4 }}>
              {c.value}
            </div>
          </Link>
        ))}
      </div>

      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 className="aside-title" style={{ margin: 0 }}>
            最新通知
            {unread > 0 ? (
              <span className="badge badge-red" style={{ marginLeft: 8 }}>
                {unread} 条未读
              </span>
            ) : null}
          </h2>
          <Link href="/dashboard/notifications" className="btn btn-sm">
            全部通知
          </Link>
        </div>

        {notices.length === 0 ? (
          <div className="empty">
            <div className="empty-title">暂时没有通知</div>
            <div className="text-sm">投稿审核结果、账号安全提醒都会出现在这里。</div>
          </div>
        ) : (
          <ul className="aside-list">
            {notices.map((n) => (
              <li key={n.id} className="aside-link" style={{ display: "block" }}>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  {!n.isRead ? <span className="badge badge-accent">未读</span> : null}
                  <strong style={{ fontSize: 14 }}>{n.title}</strong>
                  <span className="text-muted text-sm" style={{ marginLeft: "auto" }}>
                    {String(n.createdAt).slice(0, 16)}
                  </span>
                </div>
                <div className="text-muted text-sm" style={{ marginTop: 2 }}>
                  {n.body}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card card-pad" style={{ marginTop: 18 }}>
        <h2 className="aside-title" style={{ marginTop: 0 }}>
          快速开始
        </h2>
        <div className="row" style={{ gap: 10 }}>
          <Link href="/submit" className="btn">
            投稿一个网址 / 文章
          </Link>
          <Link href="/dashboard/profile" className="btn btn-outline">
            修改账号资料
          </Link>
        </div>
      </div>
    </div>
  );
}
