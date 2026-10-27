import Link from "next/link";

export function Pagination({
  current,
  totalPages,
  basePath,
  extraParams = {},
}: {
  current: number;
  totalPages: number;
  basePath: string;
  extraParams?: Record<string, string>;
}) {
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams(extraParams);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  // 生成页码：首页、末页、当前页附近，中间用省略号
  const pages: (number | "...")[] = [];
  const push = (n: number | "...") => pages.push(n);

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) push(i);
  } else {
    push(1);
    if (current > 3) push("...");
    for (let i = Math.max(2, current - 1); i <= Math.min(totalPages - 1, current + 1); i++) push(i);
    if (current < totalPages - 2) push("...");
    push(totalPages);
  }

  return (
    <nav className="pagination" aria-label="分页">
      {current > 1 ? (
        <Link href={href(current - 1)} className="page-link">
          上一页
        </Link>
      ) : null}
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`e${i}`} className="page-link" style={{ border: "none", background: "none" }}>
            …
          </span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            className={`page-link ${p === current ? "active" : ""}`}
          >
            {p}
          </Link>
        )
      )}
      {current < totalPages ? (
        <Link href={href(current + 1)} className="page-link">
          下一页
        </Link>
      ) : null}
    </nav>
  );
}
