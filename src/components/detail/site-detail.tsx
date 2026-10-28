import Link from "next/link";
import { notFound } from "next/navigation";
import { getContentItem, getContentItems, parseContentId } from "@/lib/content";

/** 网址详情页：/sites/{id}.html */
export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = parseContentId(rawId);
  if (!id) notFound();
  const item = await getContentItem(id);
  if (!item || item.type !== "site") notFound();

  const related = await getContentItems({ categoryId: item.categoryId, limit: 7 });
  const relatedFiltered = related.filter((r) => r.id !== item.id).slice(0, 6);

  return (
    <div className="layout-with-aside">
      <article className="detail">
        <div className="row mb-2" style={{ gap: 14, alignItems: "flex-start" }}>
          <div className="site-icon" style={{ width: 56, height: 56, borderRadius: 12 }}>
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt={`${item.title} 图标`} referrerPolicy="no-referrer" />
            ) : (
              item.title.charAt(0).toUpperCase()
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="detail-title" style={{ marginBottom: 6 }}>
              {item.title}
            </h1>
            <div
              className="detail-meta"
              style={{ paddingBottom: 0, borderBottom: "none", marginBottom: 0 }}
            >
              {item.categoryName ? (
                <Link href={`/category/${item.categorySlug}`} className="badge badge-accent">
                  {item.categoryName}
                </Link>
              ) : null}
              <span>收录于 {item.date.slice(0, 10)}</span>
              <span>{item.views.toLocaleString("zh-CN")} 次浏览</span>
            </div>
          </div>
        </div>

        <div className="divider" />

        {item.description ? (
          <p style={{ fontSize: 15.5, lineHeight: 1.85, color: "var(--text-2)" }}>
            {item.description}
          </p>
        ) : null}

        {item.url ? (
          <a
            href={item.shortUrl || `/go/${item.id}`}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="btn btn-lg mt-2"
          >
            打开网站 ↗
          </a>
        ) : null}

        {item.spareLinks && item.spareLinks.length > 0 ? (
          <>
            <h2 className="aside-title" style={{ marginTop: 18 }}>
              备用地址
            </h2>
            <ul className="aside-list">
              {item.spareLinks.map((s, i) => (
                <li key={i} className="aside-link">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-accent"
                  >
                    {s.name || s.url}
                  </a>
                  {s.note ? (
                    <span className="text-muted text-sm"> — {s.note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div className="divider" />

        <h2 className="aside-title">相关推荐</h2>
        {relatedFiltered.length > 0 ? (
          <div className="grid">
            {relatedFiltered.map((r) => (
              <Link key={r.id} href={r.path} className="badge">
                {r.title}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-muted text-sm">暂无相关内容</p>
        )}
      </article>

      <aside>
        <div className="aside-card">
          <h2 className="aside-title">站点信息</h2>
          <ul className="aside-list text-sm">
            <li className="aside-link">分类：{item.categoryName || "未分类"}</li>
            <li className="aside-link">收录时间：{item.date.slice(0, 10)}</li>
            <li className="aside-link">浏览量：{item.views.toLocaleString("zh-CN")}</li>
          </ul>

          {item.tags.length > 0 ? (
            <>
              <h2 className="aside-title" style={{ marginTop: 16 }}>
                标签
              </h2>
              {/* 标签单独成块并自动换行，不会把侧栏撑破 */}
              <div className="tag-row">
                {item.tags.map((t) => (
                  <Link key={t.id} href={`/tag/${t.slug}`} className="tag-chip">
                    <span className="tag-hash">#</span>
                    {t.name}
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
