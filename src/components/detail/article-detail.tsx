import Link from "next/link";
import { notFound } from "next/navigation";
import { getContentItem, parseContentId } from "@/lib/content";
import { renderMarkdown } from "@/lib/submissions";
import { attachHeadingAnchors } from "@/lib/markdown";
import { codeThemeClasses } from "@/lib/code-theme";
import CodeCopy from "./code-copy";

/** 文章详情页：/{id}.html */
export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = parseContentId(rawId);
  if (!id) notFound();
  const item = await getContentItem(id);
  if (!item || item.type !== "article") notFound();

  const [rendered, codeClasses] = await Promise.all([
    renderMarkdown(item.contentMd || "", `${item.title} 配图`),
    codeThemeClasses(),
  ]);
  const { html, headings } = attachHeadingAnchors(rendered);

  return (
    <div className="layout-with-aside">
      <article className="detail">
        <h1 className="detail-title">{item.title}</h1>
        <div className="detail-meta">
          {item.categoryName ? (
            <Link href={`/category/${item.categorySlug}`} className="badge badge-accent">
              {item.categoryName}
            </Link>
          ) : null}
          <span>发布于 {item.date.slice(0, 10)}</span>
          <span>{item.views.toLocaleString("zh-CN")} 次浏览</span>
        </div>

        {/* 标签单独一行，超长自动换行，不会溢出 */}
        {item.tags.length > 0 ? (
          <div className="tag-row">
            {item.tags.map((t) => (
              <Link key={t.id} href={`/tag/${t.slug}`} className="tag-chip">
                <span className="tag-hash">#</span>
                {t.name}
              </Link>
            ))}
          </div>
        ) : null}

        <div
          className={`article-body ${codeClasses}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>

      <aside>
        <div className="aside-card">
          <h2 className="aside-title">文章信息</h2>
          <ul className="aside-list text-sm">
            <li className="aside-link">分类：{item.categoryName || "未分类"}</li>
            <li className="aside-link">发布：{item.date.slice(0, 10)}</li>
            <li className="aside-link">更新：{item.modified.slice(0, 10)}</li>
            <li className="aside-link">浏览：{item.views.toLocaleString("zh-CN")}</li>
          </ul>

          {item.tags.length > 0 ? (
            <>
              <h2 className="aside-title" style={{ marginTop: 16 }}>
                标签
              </h2>
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

        {/* 目录单独一张卡；标题不足 3 个的短文不值得占这块位置 */}
        {headings.length >= 3 ? (
          <div className="aside-card toc-card">
            <h2 className="aside-title">目录</h2>
            <ul className="toc-list">
              {headings.map((h) => (
                <li key={h.id}>
                  <a
                    className={`toc-link${h.level >= 3 ? " toc-sub" : ""}`}
                    href={`#${h.id}`}
                    title={h.text}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      <CodeCopy />
    </div>
  );
}
