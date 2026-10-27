import Link from "next/link";
import { getCategories, getContentItems, getTotalViews } from "@/lib/content";
import { getFavoriteState } from "@/lib/favorites";
import { ContentGrid } from "@/components/content-card";
import CategoryIcon from "@/components/category-icon";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const categories = await getCategories();
  const totalViews = await getTotalViews();
  const fav = await getFavoriteState();
  const favoriteIds = new Set(fav.ids);

  // 主页展示有内容的顶级分类，每个分类混合展示网址/文章/应用（同一套卡片）
  const sections = await Promise.all(
    categories
      .filter((c) => c.parent === 0 && c.count > 0)
      .map(async (cat) => ({
        cat,
        items: await getContentItems({ categoryId: cat.id, limit: 12, orderBy: "date" }),
      }))
  );

  const visible = sections.filter((s) => s.items.length > 0);

  return (
    <>
      <section className="hero" style={{ marginTop: -26, marginBottom: 28 }}>
        <div className="container">
          <h1 className="page-title" style={{ fontSize: 27 }}>
            发现优质的网络资源
          </h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            网址收藏、技术教程、软件下载，分类聚合，一站浏览。
          </p>
          <div className="row mt-2 text-sm text-muted" style={{ gap: 18, flexWrap: "wrap" }}>
            <span>
              共 <b>{visible.length}</b> 个分类
            </span>
            <span>
              累计 <b>{totalViews.toLocaleString("zh-CN")}</b> 次浏览
            </span>
          </div>
        </div>
      </section>

      {visible.length === 0 ? (
        <div className="empty">
          <div className="empty-title">还没有任何内容</div>
          <div>请先导入数据库数据，或在后台添加分类与内容。</div>
        </div>
      ) : (
        visible.map(({ cat, items }) => (
          <section className="section" key={cat.id}>
            <div className="section-head">
              <h2 className="section-title">
                <Link href={`/category/${cat.slug}`}>
                  <CategoryIcon icon={cat.icon} name={cat.name} size={18} className="section-icon" />
                  <span>{cat.name}</span>
                </Link>
              </h2>
              <span className="text-sm text-muted">
                {cat.siteCount > 0 ? `网址 ${cat.siteCount}` : ""}
                {cat.siteCount > 0 && (cat.articleCount > 0 || cat.appCount > 0) ? " · " : ""}
                {cat.articleCount > 0 ? `文章 ${cat.articleCount}` : ""}
                {cat.articleCount > 0 && cat.appCount > 0 ? " · " : ""}
                {cat.appCount > 0 ? `下载 ${cat.appCount}` : ""}
              </span>
              <Link href={`/category/${cat.slug}`} className="section-more">
                查看全部 →
              </Link>
            </div>
            <ContentGrid
              items={items}
              showCategory={false}
              favoriteIds={favoriteIds}
              loggedIn={fav.loggedIn}
            />
          </section>
        ))
      )}
    </>
  );
}
