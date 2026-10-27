import Link from "next/link";
import { notFound } from "next/navigation";
import { getMailLogBody } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function MailDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const body = await getMailLogBody(Number(id));
  if (body == null) notFound();

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
      <div className="card card-pad">
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
          {body}
        </pre>
      </div>
    </div>
  );
}
