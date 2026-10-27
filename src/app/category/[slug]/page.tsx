import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategories, getCategoryBySlug, getContentItems } from "@/lib/content";
import { getFavoriteState } from "@/lib/favorites";
import { ContentGrid } from "@/components/content-card";
import { Pagination } from "@/components/pagination";
import CategoryIcon from "@/components/category-icon";

export const dynamic = "force-dynamic";

const PER_PAGE = 24;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  return { title: cat ? `${cat.name} - 分类` : "分类" };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const typeFilter = sp.type;

  const cat = await getCategoryBySlug(slug);
  if (!cat) notFound();

  const [items, allCats, fav] = await Promise.all([
    getContentItems({
      categoryId: cat.id,
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
      orderBy: "date",
      type: typeFilter === "site" || typeFilter === "article" || typeFilter === "app" ? typeFilter : undefined,
    }),
    getCategories(),
    getFavoriteState(),
  ]);
  const favoriteIds = new Set(fav.ids);
  const children = allCats.filter((c) => c.parent === cat.id);

  const total = typeFilter
    ? typeFilter === "site"
      ? cat.siteCount
      : typeFilter === "article"
        ? cat.articleCount
        : cat.appCount
    : cat.count;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const tabs = [
    { key: "", label: "全部", count: cat.count },
    { key: "site", label: "网址", count: cat.siteCount },
    { key: "article", label: "文章", count: cat.articleCount },
    { key: "app", label: "下载", count: cat.appCount },
  ];

  return (
    <div className="layout-with-aside">
      <div>
        <h1 className="page-title cat-title">
          <CategoryIcon icon={cat.icon} name={cat.name} size={22} className="cat-title-icon" />
          <span>{cat.name}</span>
        </h1>
        <p className="page-sub">
          共 {total} 条内容
          {cat.siteCount > 0 ? `，其中网址 ${cat.siteCount}` : ""}
          {cat.articleCount > 0 ? `，文章 ${cat.articleCount}` : ""}
          {cat.appCount > 0 ? `，下载 ${cat.appCount}` : ""}
        </p>

        <div className="toolbar">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.key ? `/category/${cat.slug}?type=${t.key}` : `/category/${cat.slug}`}
              className={`btn btn-sm ${t.key === (typeFilter ?? "") ? "" : "btn-outline"}`}
            >
              {t.label} ({t.count})
            </Link>
          ))}
        </div>

        {children.length > 0 ? (
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <span className="text-muted text-sm">子分类：</span>
            {children.map((c) => (
              <Link key={c.id} href={`/category/${c.slug}`} className="badge badge-accent">
                <CategoryIcon icon={c.icon} name={c.name} size={13} />
                <span>
                  {c.name} ({c.count})
                </span>
              </Link>
            ))}
          </div>
        ) : null}

        <ContentGrid
          items={items}
          showCategory={false}
          favoriteIds={favoriteIds}
          loggedIn={fav.loggedIn}
        />

        <Pagination current={page} totalPages={totalPages} basePath={`/category/${cat.slug}`} extraParams={typeFilter ? { type: typeFilter } : {}} />
      </div>

      <aside>
        <div className="aside-card">
          <h2 className="aside-title">全部分类</h2>
          <ul className="aside-list">
            {allCats
              .filter((c) => c.parent === 0)
              .map((c) => (
                <li key={c.id}>
                  <Link href={`/category/${c.slug}`} className="aside-link">
                    <CategoryIcon icon={c.icon} name={c.name} size={14} className="aside-icon" />
                    <span>{c.name}</span>
                    <span className="aside-count">{c.count}</span>
                  </Link>
                  {allCats.filter((sub) => sub.parent === c.id).length > 0 ? (
                    <ul className="aside-list" style={{ paddingLeft: 14, marginTop: 4 }}>
                      {allCats
                        .filter((sub) => sub.parent === c.id)
                        .map((sub) => (
                          <li key={sub.id}>
                            <Link href={`/category/${sub.slug}`} className="aside-link">
                              <CategoryIcon icon={sub.icon} name={sub.name} size={13} className="aside-icon" />
                              <span>{sub.name}</span>
                              <span className="aside-count">{sub.count}</span>
                            </Link>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </li>
              ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
