import { getCurrentUser } from "@/lib/auth";
import { getContentItems } from "@/lib/content";
import { listFavoriteIds } from "@/lib/favorites";
import { ContentGrid } from "@/components/content-card";

export const dynamic = "force-dynamic";

export const metadata = { title: "我的收藏" };

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const ids = await listFavoriteIds(user.id);
  const items = ids.length > 0 ? await getContentItems({ ids, limit: 200 }) : [];

  // 保持收藏时间倒序
  const order = new Map(ids.map((id, i) => [id, i]));
  items.sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );

  return (
    <div>
      <h1 className="page-title">我的收藏</h1>
      <p className="page-sub">共收藏 {items.length} 条内容</p>

      <ContentGrid items={items} favoriteIds={new Set(ids)} loggedIn />
    </div>
  );
}
