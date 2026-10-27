import Link from "next/link";
import { getContentItems, getTags } from "@/lib/content";
import { getFavoriteState } from "@/lib/favorites";
import { ContentGrid } from "@/components/content-card";
import { Pagination } from "@/components/pagination";

export const dynamic = "force-dynamic";

const PER_PAGE = 24;

export const metadata = { title: "搜索" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const [items, tags, fav] = await Promise.all([
    q
      ? getContentItems({ keyword: q, limit: PER_PAGE, offset: (page - 1) * PER_PAGE })
      : Promise.resolve([]),
    getTags(24),
    getFavoriteState(),
  ]);
  const favoriteIds = new Set(fav.ids);

  return (
    <div className="layout-with-aside">
      <div>
        <h1 className="page-title">搜索</h1>
        <p className="page-sub">
          {q ? `“${q}” 的搜索结果` : "输入关键词查找网址、文章与下载资源"}
        </p>

        <form action="/search" className="search-form mb-3">
          <input
            type="search"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="搜索网址、文章或标签…"
            aria-label="搜索"
          />
          <button type="submit" className="btn btn-lg">
            搜索
          </button>
        </form>

        {q ? (
          <>
            <ContentGrid items={items} favoriteIds={favoriteIds} loggedIn={fav.loggedIn} />
            {items.length >= PER_PAGE ? (
              <Pagination
                current={page}
                totalPages={999}
                basePath="/search"
                extraParams={{ q }}
              />
            ) : null}
          </>
        ) : null}
      </div>

      <aside>
        <div className="aside-card">
          <h2 className="aside-title">热门标签</h2>
          <div className="tag-cloud">
            {tags.map((t) => (
              <Link key={t.id} href={`/tag/${t.slug}`} className="badge">
                #{t.name} ({t.count})
              </Link>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
