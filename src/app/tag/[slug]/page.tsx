import Link from "next/link";
import { notFound } from "next/navigation";
import { getContentItems, getTags } from "@/lib/content";
import { getFavoriteState } from "@/lib/favorites";
import { ContentGrid } from "@/components/content-card";

export const dynamic = "force-dynamic";

export default async function TagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const tags = await getTags(200);
  const tag = tags.find((t) => t.slug === slug);
  if (!tag) notFound();

  const [items, fav] = await Promise.all([
    getContentItems({ tagSlug: slug, limit: 200 }),
    getFavoriteState(),
  ]);
  const favoriteIds = new Set(fav.ids);

  return (
    <div className="container">
      <h1 className="page-title">#{tag.name}</h1>
      <p className="page-sub">共收录 {items.length} 条内容</p>

      {items.length > 0 ? (
        <ContentGrid
          items={items}
          showCategory
          favoriteIds={favoriteIds}
          loggedIn={fav.loggedIn}
        />
      ) : (
        <div className="card card-pad">
          <div className="empty">
            <div className="empty-title">该标签下暂时没有内容</div>
          </div>
        </div>
      )}

      <div className="section" style={{ marginTop: 34 }}>
        <div className="section-head">
          <h2 className="section-title">其它标签</h2>
        </div>
        <div className="grid" style={{ gap: 10 }}>
          {tags
            .filter((t) => t.slug !== slug)
            .slice(0, 40)
            .map((t) => (
              <Link key={t.id} href={`/tag/${t.slug}`} className="badge">
                #{t.name}
                <span className="aside-count">{t.count}</span>
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
