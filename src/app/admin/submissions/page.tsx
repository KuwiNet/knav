import Link from "next/link";
import { listSubmissions } from "@/lib/submissions";
import { Pagination } from "@/components/pagination";
import ReviewQueue from "@/components/admin/review-queue";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = (sp.status ?? "pending") as "pending" | "approved" | "rejected";

  const { items, total } = await listSubmissions({
    status,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs = [
    { key: "pending", label: "待审核" },
    { key: "approved", label: "已通过" },
    { key: "rejected", label: "未通过" },
  ];

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        投稿审核
      </h1>
      <p className="page-sub">共 {total} 条。通过后内容会自动发布到对应分类，并邮件通知作者。</p>

      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/submissions?status=${t.key}`}
            className={`btn btn-sm ${status === t.key ? "" : "btn-outline"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {status === "pending" ? (
        <ReviewQueue items={items} />
      ) : (
        <div className="card card-pad">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th style={{ width: 80 }}>类型</th>
                  <th style={{ width: 100 }}>作者</th>
                  <th style={{ width: 110 }}>分类</th>
                  <th style={{ width: 150 }}>审核时间</th>
                  <th>审核意见</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>
                      <span className="badge">{s.type === "site" ? "网址" : "文章"}</span>
                    </td>
                    <td className="text-muted text-sm">{s.username}</td>
                    <td className="text-muted text-sm">{s.categoryName}</td>
                    <td className="text-muted text-sm nowrap">
                      {s.reviewedAt ? String(s.reviewedAt).slice(0, 16) : "-"}
                    </td>
                    <td className="text-muted text-sm">{s.reviewNote || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 ? (
        <Pagination
          current={page}
          totalPages={totalPages}
          basePath="/admin/submissions"
          extraParams={{ status }}
        />
      ) : null}
    </div>
  );
}
