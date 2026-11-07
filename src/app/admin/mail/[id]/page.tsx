import Link from "next/link";
import { notFound } from "next/navigation";
import { getMailLog } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function MailDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const log = await getMailLog(Number(id));
  if (!log) notFound();

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          邮件正文 #{id}
        </h1>
        <Link href="/admin/mail" className="btn btn-outline btn-sm">
          返回列表
        </Link>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{log.subject || "（无主题）"}</div>
          <div className="row text-muted text-sm" style={{ gap: 12, marginTop: 6, flexWrap: "wrap" }}>
            <span>收件人：{log.to}</span>
            <span>{String(log.createdAt).slice(0, 19)}</span>
            <span className={log.status === "sent" ? "badge badge-green" : "badge badge-red"}>
              {log.status === "sent" ? "已发送" : "失败"}
            </span>
          </div>
          {/* 列表里错误信息是省略号，完整原因在这一页给全 */}
          {log.error ? (
            <div className="alert alert-error text-sm" style={{ marginTop: 10, marginBottom: 0 }}>
              {log.error}
            </div>
          ) : null}
        </div>
        <iframe
          className="mail-preview-frame"
          style={{ height: "min(72vh, 780px)" }}
          title="邮件正文预览"
          sandbox=""
          srcDoc={log.body}
        />
      </div>

      <details style={{ marginTop: 12 }}>
        <summary className="text-muted text-sm" style={{ cursor: "pointer" }}>
          查看源代码
        </summary>
        <div className="card card-pad" style={{ marginTop: 8 }}>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              margin: 0,
              fontSize: 12.5,
              lineHeight: 1.7,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            }}
          >
            {log.body}
          </pre>
        </div>
      </details>
    </div>
  );
}
