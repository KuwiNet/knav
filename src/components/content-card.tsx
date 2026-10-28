import Link from "next/link";
import type { ContentItem } from "@/lib/content";
import type { CardConfig } from "@/lib/settings";
import FavoriteButton from "./favorite-button";
import CardIcon from "./card-icon";

/**
 * 统一内容卡片。
 *
 * 需求核心：「同一个分类要能显示网址也能显示文章，两个类型的显示卡一致」。
 * 因此这里用同一套结构渲染三类内容，只在最底部的操作按钮上区分：
 *   - 网址 → 直达外链
 *   - 文章 → 阅读全文
 *   - 应用 → 查看下载
 * 卡片外观、圆角、阴影、图标位完全相同，混排时视觉统一。
 *
 * 外观（风格 / 圆角 / 密度 / 是否固定高度 / 是否显示分类、类型、浏览量、标签）
 * 全部由后台「站点设置 → 外观与卡片」控制，这里只负责按配置渲染。
 */

const TYPE_LABEL: Record<ContentItem["type"], string> = {
  site: "网址",
  article: "文章",
  app: "下载",
};

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function ContentCard({
  item,
  config,
  showCategory = true,
  favoriteIds,
  loggedIn = true,
}: {
  item: ContentItem;
  config?: CardConfig;
  showCategory?: boolean;
  /** 当前用户已收藏的 content_id 集合 */
  favoriteIds?: Set<number>;
  /** 是否已登录（未登录时点击收藏跳登录页） */
  loggedIn?: boolean;
}) {
  const isSite = item.type === "site";
  const isApp = item.type === "app";

  // 详情路径：网址与文章走各自页面，应用走下载页
  const detailHref = item.type === "app" ? `/app/${item.id}.html` : item.path;

  const showCategoryBadge = config ? config.showCategory : showCategory;
  const showType = config ? config.showType : true;
  const showViews = config ? config.showViews : true;
  const showTags = config ? config.showTags : false;
  const titleLines = config ? config.titleLines : 1;

  // 图标：自定义图标 → 站点图标 → 封面/正文首图 → 标题首字母
  const iconSrc =
    config?.iconMode === "letter"
      ? ""
      : item.image || item.cover || "";

  return (
    <article className="site-card">
      <FavoriteButton
        contentId={item.id}
        initial={favoriteIds?.has(item.id) ?? false}
        loggedIn={loggedIn}
      />
      <div className="site-card-head">
        <div className="site-icon">
          <CardIcon
            src={iconSrc}
            letter={(item.title || "?").trim().charAt(0).toUpperCase()}
            alt={`${item.title} 图标`}
          />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3
            className="site-title"
            style={{ WebkitLineClamp: titleLines } as React.CSSProperties}
          >
            <Link href={detailHref} className="card-link">
              <span className="sr-only">{item.title}</span>
            </Link>
            {item.title}
          </h3>
          <p className="site-desc">
            {item.description || (isApp ? "软件资源下载" : "暂无简介")}
          </p>
        </div>
      </div>

      <div className="site-foot">
        {showCategoryBadge && item.categoryName ? (
          <Link href={`/category/${item.categorySlug}`} className="badge badge-accent">
            {item.categoryName}
          </Link>
        ) : null}

        {showType ? <span className="badge">{TYPE_LABEL[item.type]}</span> : null}

        {showTags
          ? item.tags.slice(0, 2).map((t) => (
              <Link key={t.id} href={`/tag/${t.slug}`} className="badge">
                #{t.name}
              </Link>
            ))
          : null}

        <span className="card-meta">
          {showViews && item.views > 0 ? (
            <span>{formatCount(item.views)} 浏览</span>
          ) : null}
          {isSite && item.url ? (
            <a
              href={item.shortUrl || `/go/${item.id}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="card-action"
            >
              直达 ↗
            </a>
          ) : (
            <Link href={detailHref} className="card-action">
              {isApp ? "下载" : "阅读"} →
            </Link>
          )}
        </span>
      </div>
    </article>
  );
}

/** 卡片网格 */
export async function ContentGrid({
  items,
  showCategory = true,
  favoriteIds,
  loggedIn = true,
}: {
  items: ContentItem[];
  showCategory?: boolean;
  favoriteIds?: Set<number>;
  loggedIn?: boolean;
}) {
  const { getCardConfig } = await import("@/lib/settings");
  const config = await getCardConfig();

  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="empty-title">暂无内容</div>
        <div>换个分类或关键词试试</div>
      </div>
    );
  }

  const gridStyle: React.CSSProperties = {
    ["--card-radius" as string]: `${config.radius}px`,
  };

  return (
    <div
      className={`grid card-style-${config.style} card-density-${config.density}${
        config.fixedHeight ? " card-fixed-height" : ""
      }`}
      style={gridStyle}
      data-columns={config.columns}
    >
      {items.map((item) => (
        <ContentCard
          key={`${item.type}-${item.id}`}
          item={item}
          config={config}
          showCategory={showCategory}
          favoriteIds={favoriteIds}
          loggedIn={loggedIn}
        />
      ))}
    </div>
  );
}
