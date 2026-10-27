import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listSubmissions } from "@/lib/submissions";
import { withdrawSubmissionAction } from "@/lib/actions/submission-actions";
import { Pagination } from "@/components/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending: { label: "待审核", cls: "badge badge-amber" },
  approved: { label: "已通过", cls: "badge badge-green" },
  rejected: { label: "未通过", cls: "badge badge-red" },
};

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = (sp.status ?? "") as "" | "pending" | "approved" | "rejected";

  const { items, total } = await listSubmissions({
    userId: user.id,
    status: status || undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs = [
    { key: "", label: "全部" },
    { key: "pending", label: "待审核" },
    { key: "approved", label: "已通过" },
    { key: "rejected", label: "未通过" },
  ];

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          我的投稿
        </h1>
        <Link href="/submit" className="btn btn-sm">
          新建投稿
        </Link>
      </div>
      <p className="page-sub">共 {total} 条记录。审核通过的内容会自动发布到对应分类。</p>

      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <Link
            key={t.key || "all"}
            href={t.key ? `/dashboard/submissions?status=${t.key}` : "/dashboard/submissions"}
            className={`btn btn-sm ${status === t.key ? "" : "btn-outline"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="card card-pad">
          <div className="empty">
            <div className="empty-title">还没有投稿</div>
            <div className="text-sm">
              分享一个好用的网址，或写一篇 Markdown 文章，都可以从投稿开始。
            </div>
            <div style={{ marginTop: 14 }}>
              <Link href="/submit" className="btn">
                去投稿
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="card card-pad">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th style={{ width: 90 }}>类型</th>
                  <th style={{ width: 120 }}>分类</th>
                  <th style={{ width: 90 }}>状态</th>
                  <th style={{ width: 150 }}>提交时间</th>
                  <th style={{ width: 130 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => {
                  const st = STATUS_MAP[s.status] ?? STATUS_MAP.pending;
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{s.title}</div>
                        {s.status === "rejected" && s.reviewNote ? (
                          <div className="text-muted text-sm">审核意见：{s.reviewNote}</div>
                        ) : null}
                        {s.status === "approved" && s.publishedId ? (
                          <div className="text-muted text-sm">
                            已发布：
                            <Link
                              href={
                                s.type === "site"
                                  ? `/sites/${s.publishedId}.html`
                                  : `/${s.publishedId}.html`
                              }
                              className="text-accent"
                            >
                              查看
                            </Link>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className="badge">{s.type === "site" ? "网址" : "文章"}</span>
                      </td>
                      <td className="text-muted">{s.categoryName || "-"}</td>
                      <td>
                        <span className={st.cls}>{st.label}</span>
                      </td>
                      <td className="text-muted text-sm nowrap">
                        {String(s.createdAt).slice(0, 16)}
                      </td>
                      <td>
                        {s.status === "pending" ? (
                          <form action={withdrawSubmissionAction}>
                            <input type="hidden" name="id" value={s.id} />
                            <button type="submit" className="btn btn-outline btn-sm">
                              撤回
                            </button>
                          </form>
                        ) : (
                          <span className="text-muted text-sm">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <Pagination
              current={page}
              totalPages={totalPages}
              basePath="/dashboard/submissions"
              extraParams={status ? { status } : {}}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
