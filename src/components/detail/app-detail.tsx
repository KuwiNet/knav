import Link from "next/link";
import { notFound } from "next/navigation";
import { getContentItem, getDownloads, parseContentId } from "@/lib/content";

/** 应用详情页：/app/{id}.html */
export default async function AppDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = parseContentId(rawId);
  if (!id) notFound();
  const item = await getContentItem(id);
  if (!item || item.type !== "app") notFound();

  const downloads = await getDownloads(item.id);
  // 架构列只在真的填了架构时才出现，全是空的话多一列纯占宽度
  const showArch = downloads.some((d) => d.arch);

  return (
    <div className="layout-with-aside">
      <article className="detail">
        <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
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
              <span>更新于 {item.modified.slice(0, 10)}</span>
              <span>{item.views.toLocaleString("zh-CN")} 次浏览</span>
            </div>
          </div>
        </div>

        <div className="divider" />

        {item.description ? (
          <p style={{ fontSize: 15, color: "var(--text-2)" }}>{item.description}</p>
        ) : null}

        {downloads.length > 0 ? (
          <>
            <h2 className="aside-title" style={{ marginTop: 18 }}>
              下载列表
            </h2>
            <div className="table-wrap">
              <table className="dl-table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>平台</th>
                    {showArch ? <th style={{ width: 100 }}>架构</th> : null}
                    <th style={{ width: 130 }}>版本</th>
                    <th style={{ width: 90 }}>大小</th>
                    <th style={{ width: 110 }}>更新日期</th>
                    <th>下载地址</th>
                  </tr>
                </thead>
                <tbody>
                  {downloads.map((d, i) => (
                    <tr key={d.id || i}>
                      <td>
                        <span className="badge badge-accent">{d.platform || "通用"}</span>
                      </td>
                      {showArch ? (
                        <td className="text-muted">{d.arch || "不限"}</td>
                      ) : null}
                      <td>
                        {d.version || "-"}
                        {d.isLatest ? (
                          <span className="badge badge-green" style={{ marginLeft: 6 }}>
                            最新
                          </span>
                        ) : null}
                      </td>
                      <td className="text-muted">{d.fileSize || "-"}</td>
                      <td className="text-muted nowrap">{d.date || "-"}</td>
                      <td>
                        {/* 同一个平台版本可以挂多个镜像：官方直链 / 网盘 / 应用商店 */}
                        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                          {(d.buttons && d.buttons.length > 0
                            ? d.buttons
                            : d.url
                              ? [{ name: "下载", url: d.url, info: "" }]
                              : []
                          ).map((b, bi) => (
                            <a
                              key={bi}
                              href={b.url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="btn btn-sm"
                              title={b.info || b.name}
                            >
                              {b.name || "下载"}
                            </a>
                          ))}
                        </div>
                        {d.note ? (
                          <div className="text-muted text-sm" style={{ marginTop: 4 }}>
                            {d.note}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="alert alert-info">该资源暂未提供下载地址。</div>
        )}
      </article>

      <aside>
        <div className="aside-card">
          <h2 className="aside-title">资源信息</h2>
          <ul className="aside-list text-sm">
            <li className="aside-link">分类：{item.categoryName || "未分类"}</li>
            <li className="aside-link">更新：{item.modified.slice(0, 10)}</li>
            <li className="aside-link">下载次数：{item.views.toLocaleString("zh-CN")}</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
