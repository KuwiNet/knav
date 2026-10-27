import type { SiteConfig } from "@/lib/site-config";

/**
 * 站点公告 / 广告栏 / 关闭提示。
 *
 * 三个区块都由后台「站点设置」控制：
 *   - 公告条：announcement_enabled + announcement
 *   - 广告栏：ad_enabled + ad_position + ad_html
 *   - 站点关闭：site_open
 *
 * 广告内容是后台自己填的 HTML，属于站点管理员的自主内容，
 * 与「用户投稿内容」不是一回事，因此这里按管理员内容原样输出。
 */
export function SiteNotice({
  cfg,
  position,
}: {
  cfg: SiteConfig;
  position: "top" | "bottom";
}) {
  const showAd =
    cfg.adEnabled &&
    cfg.adHtml.trim() !== "" &&
    (cfg.adPosition === "both" || cfg.adPosition === position);

  return (
    <>
      {position === "top" && cfg.announcementEnabled && cfg.announcement.trim() ? (
        <div className="announce-bar">
          <div className="container announce-inner">{cfg.announcement}</div>
        </div>
      ) : null}

      {showAd ? (
        <div className="ad-bar">
          <div
            className="container ad-inner"
            dangerouslySetInnerHTML={{ __html: cfg.adHtml }}
          />
        </div>
      ) : null}
    </>
  );
}
