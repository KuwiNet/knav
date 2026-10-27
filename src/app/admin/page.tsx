import Link from "next/link";
import { getAdminStats } from "@/lib/admin";
import { listSubmissions } from "@/lib/submissions";
import { formatSize } from "@/lib/media-config";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [stats, recent] = await Promise.all([
    getAdminStats(),
    listSubmissions({ limit: 8 }),
  ]);

  const n = (v: number) => v.toLocaleString("zh-CN");

  const cards = [
    { label: "网址", value: n(stats.sites), href: "/admin/content?type=site" },
    { label: "文章", value: n(stats.articles), href: "/admin/content?type=article" },
    { label: "下载资源", value: n(stats.apps), href: "/admin/content?type=app" },
    { label: "分类", value: n(stats.categories), href: "/admin/categories" },
    { label: "标签", value: n(stats.tags), href: "/admin/content" },
    { label: "注册用户", value: n(stats.users), href: "/admin/users" },
    { label: "待审核投稿", value: n(stats.pendingSubmissions), href: "/admin/submissions" },
    { label: "总浏览量", value: n(stats.totalViews), href: "/admin/content" },
    {
      label: "素材",
      value: `${n(stats.media)} 个 · ${formatSize(stats.mediaBytes)}`,
      href: "/admin/media",
    },
  ];

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        数据统计
      </h1>
      <p className="page-sub">
        今日新增投稿 {stats.todaySubmissions} 条，待验证邮箱账号 {stats.pendingUsers} 个。
      </p>

      <div className="grid grid-lg" style={{ marginBottom: 22 }}>
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card card-pad">
            <div className="text-muted text-sm">{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 680, marginTop: 4 }}>{c.value}</div>
          </Link>
        ))}
      </div>

      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 className="aside-title" style={{ margin: 0 }}>
            最新投稿
          </h2>
          <Link href="/admin/submissions" className="btn btn-sm">
            全部投稿
          </Link>
        </div>

        {recent.items.length === 0 ? (
          <div className="empty">
            <div className="empty-title">暂无投稿</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th style={{ width: 80 }}>类型</th>
                  <th style={{ width: 90 }}>作者</th>
                  <th style={{ width: 90 }}>状态</th>
                  <th style={{ width: 140 }}>时间</th>
                </tr>
              </thead>
              <tbody>
                {recent.items.map((s) => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>
                      <span className="badge">{s.type === "site" ? "网址" : "文章"}</span>
                    </td>
                    <td className="text-muted text-sm">{s.username}</td>
                    <td>
                      <span
                        className={
                          s.status === "approved"
                            ? "badge badge-green"
                            : s.status === "rejected"
                              ? "badge badge-red"
                              : "badge badge-amber"
                        }
                      >
                        {s.status === "approved"
                          ? "已通过"
                          : s.status === "rejected"
                            ? "未通过"
                            : "待审核"}
                      </span>
                    </td>
                    <td className="text-muted text-sm nowrap">
                      {String(s.createdAt).slice(0, 16)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
