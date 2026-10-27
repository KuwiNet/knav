import Link from "next/link";
import { listMailLogs, listNotifications } from "@/lib/admin";
import { Pagination } from "@/components/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const NOTICE_TYPES: Record<string, string> = {
  verify: "邮箱验证",
  review: "投稿审核",
  admin: "管理员",
  system: "系统",
};

export default async function AdminMailPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === "notifications" ? "notifications" : "mail";
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const mail =
    tab === "mail"
      ? await listMailLogs({ limit: PAGE_SIZE, offset })
      : null;
  const notices =
    tab === "notifications"
      ? await listNotifications({ limit: PAGE_SIZE, offset })
      : null;
  const data = mail ?? notices!;
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        消息日志
      </h1>
      <p className="page-sub">
        {tab === "mail"
          ? `共 ${data.total} 封邮件。未配置 SMTP 时邮件不会真正发出，但会记录在这里，便于本地调试。`
          : `共 ${data.total} 条站内通知。这里能看到通知发给了谁、是否已读，方便排查「用户说没收到」的问题。`}
      </p>

      <div className="admin-tabs">
        <Link
          href="/admin/mail"
          className={`admin-tab${tab === "mail" ? " active" : ""}`}
        >
          邮件日志
        </Link>
        <Link
          href="/admin/mail?tab=notifications"
          className={`admin-tab${tab === "notifications" ? " active" : ""}`}
        >
          站内通知
        </Link>
      </div>

      <div className="card card-pad">
        {mail ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>ID</th>
                  <th style={{ width: 220 }}>收件人</th>
                  <th>主题</th>
                  <th style={{ width: 90 }}>状态</th>
                  <th style={{ width: 200 }}>错误信息</th>
                  <th style={{ width: 150 }}>时间</th>
                  <th style={{ width: 80 }}>正文</th>
                </tr>
              </thead>
              <tbody>
                {mail.items.map((m) => (
                  <tr key={m.id}>
                    <td className="text-muted">{m.id}</td>
                    <td className="text-muted text-sm">{m.to}</td>
                    <td>{m.subject}</td>
                    <td>
                      <span
                        className={m.status === "sent" ? "badge badge-green" : "badge badge-red"}
                      >
                        {m.status === "sent" ? "已发送" : "失败"}
                      </span>
                    </td>
                    <td className="text-muted text-sm" style={{ wordBreak: "break-all" }}>
                      {m.error || "-"}
                    </td>
                    <td className="text-muted text-sm nowrap">
                      {String(m.createdAt).slice(0, 16)}
                    </td>
                    <td>
                      <Link href={`/admin/mail/${m.id}`} className="btn btn-outline btn-sm">
                        查看
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>ID</th>
                  <th style={{ width: 180 }}>用户</th>
                  <th style={{ width: 100 }}>类型</th>
                  <th>标题与正文</th>
                  <th style={{ width: 80 }}>状态</th>
                  <th style={{ width: 150 }}>时间</th>
                </tr>
              </thead>
              <tbody>
                {notices?.items.map((n) => (
                  <tr key={n.id}>
                    <td className="text-muted">{n.id}</td>
                    <td>
                      <div className="strong">{n.username}</div>
                      <div className="text-muted text-sm">#{n.userId}</div>
                    </td>
                    <td>
                      <span className="badge">
                        {NOTICE_TYPES[n.type] ?? (n.type || "通知")}
                      </span>
                    </td>
                    <td>
                      <div>{n.title}</div>
                      {n.body ? (
                        <details className="notice-body">
                          <summary className="text-muted text-sm">展开正文</summary>
                          <div className="text-sm" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                            {n.body}
                          </div>
                        </details>
                      ) : null}
                      {n.link ? (
                        <div className="text-muted text-sm" style={{ wordBreak: "break-all" }}>
                          链接：{n.link}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span className={n.isRead ? "badge" : "badge badge-amber"}>
                        {n.isRead ? "已读" : "未读"}
                      </span>
                    </td>
                    <td className="text-muted text-sm nowrap">
                      {String(n.createdAt).slice(0, 16)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.items.length === 0 ? (
          <div className="empty">
            <div className="empty-title">
              {tab === "mail" ? "还没有邮件记录" : "还没有站内通知"}
            </div>
          </div>
        ) : null}

        {totalPages > 1 ? (
          <Pagination
            current={page}
            totalPages={totalPages}
            basePath="/admin/mail"
            extraParams={tab === "notifications" ? { tab } : {}}
          />
        ) : null}
      </div>
    </div>
  );
}
