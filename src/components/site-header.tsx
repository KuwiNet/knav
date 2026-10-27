import Link from "next/link";
import type { User } from "@/lib/auth";
import type { Category } from "@/lib/content";
import type { SiteConfig } from "@/lib/site-config";
import CategoryIcon from "./category-icon";
import CategoryMenu from "./category-menu";
import Avatar from "./avatar";
import GlobalSearch from "./global-search";

export function SiteHeader({
  user,
  categories,
  cfg,
}: {
  user: User | null;
  categories: Category[];
  cfg: SiteConfig;
}) {
  // 只展示顶级分类（子分类在分类页里再展开），导航栏可横向滚动
  const navCats = categories.filter((c) => c.parent === 0);
  const logoSize = cfg.logoSize || 28;

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="logo" title={cfg.siteName}>
          {cfg.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cfg.logoUrl}
              alt={cfg.siteName}
              className="logo-img"
              width={logoSize}
              height={logoSize}
              style={{ width: logoSize, height: logoSize }}
            />
          ) : null}
          {cfg.logoShowName ? (
            <span>{cfg.siteShortName || cfg.siteName}</span>
          ) : null}
        </Link>

        <nav className="nav-main">
          {navCats.map((c) => (
            <Link key={c.id} href={`/category/${c.slug}`} className="nav-link">
              <CategoryIcon icon={c.icon} name={c.name} size={15} className="nav-icon" />
              <span>{c.name}</span>
            </Link>
          ))}
        </nav>

        <CategoryMenu categories={categories} />

        <div className="header-actions">
          <GlobalSearch />
          {user ? (
            <>
              {cfg.allowSubmit ? (
                <Link href="/submit" className="btn btn-ghost btn-sm">
                  投稿
                </Link>
              ) : null}
              {cfg.allowFavorite ? (
                <Link href="/dashboard/favorites" className="btn btn-ghost btn-sm" title="我的收藏">
                  收藏
                </Link>
              ) : null}
              <Link
                href="/dashboard"
                className="btn btn-outline btn-sm"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Avatar
                  src={user.avatar}
                  name={user.nickname || user.username}
                  size={20}
                />
                <span>{user.nickname || user.username}</span>
              </Link>
              {user.role === "admin" ||
              user.role === "editor" ||
              user.role === "owner" ? (
                <Link href="/admin" className="btn btn-sm">
                  后台
                </Link>
              ) : null}
            </>
          ) : (
            <>
              {cfg.allowRegister ? (
                <>
                  <Link href="/login" className="btn btn-outline btn-sm">
                    登录
                  </Link>
                  <Link href="/register" className="btn btn-sm">
                    注册
                  </Link>
                </>
              ) : (
                <Link href="/login" className="btn btn-outline btn-sm">
                  登录
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
