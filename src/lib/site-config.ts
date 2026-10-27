import { getSettingMap } from "./settings";
import { getAssetBase, resolveAssetHref, resolveAssetUrl } from "./asset-url";

/**
 * 前台站点配置。
 *
 * 后台「站点设置」里保存的开关与文案，前台统一从这里读，
 * 避免设置项只存在于表单里、前台却没生效。
 */

export interface SiteConfig {
  /** 站点是否开放（关闭后仅提示，不提供注册/投稿等入口） */
  siteOpen: boolean;
  /** 是否允许注册 */
  allowRegister: boolean;
  /** 是否允许投稿 */
  allowSubmit: boolean;
  /** 是否显示收藏按钮 */
  allowFavorite: boolean;

  siteName: string;
  siteShortName: string;
  siteDescription: string;
  siteUrl: string;
  siteKeywords: string;
  icp: string;

  logoUrl: string;
  faviconUrl: string;
  logoSize: number;
  logoShowName: boolean;

  /** 公告条 */
  announcementEnabled: boolean;
  announcement: string;

  /** 广告栏 */
  adEnabled: boolean;
  adPosition: "top" | "bottom" | "both";
  adHtml: string;

  /** 统计与自定义代码 */
  analyticsCode: string;
  headCode: string;
  bodyCode: string;

  /** 图标字体 CSS 地址 */
  iconfontCss: string;

  /** SEO */
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  seoOgImage: string;
  seoVerification: string;
  seoRobots: string;
  seoSitemap: boolean;
  seoNoindex: boolean;

  /** 页脚 */
  footerCopyright: string;
  footerNote: string;
  footerLinks: string;
  footerIcpLink: string;

  /** 是否显示站点壁纸 */
  showWallpaper: boolean;

  /** 登录方式 */
  loginPassword: boolean;
  loginTelegram: boolean;
  loginGithub: boolean;
  loginGitee: boolean;
  loginGoogle: boolean;
  telegramBotName: string;
  githubClientId: string;
}

function str(map: Record<string, string>, key: string, fallback = ""): string {
  const v = map[key];
  return v === undefined || v === "" ? fallback : v;
}

function bool(map: Record<string, string>, key: string, fallback = true): boolean {
  const v = map[key];
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

/**
 * 解析站点验证 meta 代码。
 *
 * 后台填的是一整段 <meta name="..." content="..." />，
 * 这里拆成 name → content 的映射，交给 Next 的 metadata.other 输出，
 * 渲染出来的就是标准的 <head> 里的 meta 标签。
 */
export function parseVerificationMeta(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const text = raw ?? "";
  const re = /<meta\s+[^>]*name\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out[m[1]] = m[2];
  }
  // 也兼容只填了验证码值、没写完整标签的情况
  if (Object.keys(out).length === 0) {
    const plain = text.trim();
    if (plain && !plain.includes("<")) {
      out["google-site-verification"] = plain;
    }
  }
  return out;
}

export async function getSiteConfig(): Promise<SiteConfig> {
  const map = await getSettingMap();
  const adPos = str(map, "ad_position", "top");
  // 分享图必须给爬虫绝对地址；LOGO / favicon 随当前访问域名取，避免站点地址与实际访问不一致时裂图
  const base = await getAssetBase();

  return {
    siteOpen: bool(map, "site_open", true),
    allowRegister: bool(map, "allow_register", true),
    allowSubmit: bool(map, "allow_submit", true),
    allowFavorite: bool(map, "allow_favorite", true),

    siteName: str(map, "site_name", "knav 导航站"),
    siteShortName: str(map, "site_short_name", "knav"),
    siteDescription: str(
      map,
      "site_description",
      "优质网络站点资源收集与分享，网址收藏、技术教程与软件下载。"
    ),
    siteUrl: str(map, "site_url", "http://localhost:3000"),
    siteKeywords: str(map, "site_keywords"),
    icp: str(map, "icp"),

    logoUrl: resolveAssetHref(str(map, "logo_url", "/logo.png")),
    // favicon 必须按当前访问域名取，不能拼成生产域名，否则本地测试改图标不生效
    faviconUrl: resolveAssetHref(str(map, "favicon_url", "/icon.png")),
    logoSize: Number(map.logo_size) || 28,
    logoShowName: bool(map, "logo_show_name", true),

    announcementEnabled: bool(map, "announcement_enabled", true),
    announcement: str(map, "announcement"),

    adEnabled: bool(map, "ad_enabled", false),
    adPosition: (["top", "bottom", "both"].includes(adPos)
      ? adPos
      : "top") as SiteConfig["adPosition"],
    adHtml: str(map, "ad_html"),

    analyticsCode: str(map, "analytics_code"),
    headCode: str(map, "head_code"),
    bodyCode: str(map, "body_code"),

    iconfontCss: str(map, "iconfont_css"),

    seoTitle: str(map, "seo_title", "%s | knav 导航站"),
    seoDescription: str(map, "seo_description"),
    seoKeywords: str(map, "seo_keywords"),
    seoOgImage: resolveAssetUrl(str(map, "seo_og_image"), base),
    seoVerification: str(map, "seo_verification"),
    seoRobots: str(map, "seo_robots", "User-agent: *\nAllow: /"),
    seoSitemap: bool(map, "seo_sitemap", true),
    seoNoindex: bool(map, "seo_noindex", false),

    footerCopyright: str(map, "footer_copyright"),
    footerNote: str(map, "footer_note"),
    footerLinks: str(map, "footer_links"),
    footerIcpLink: str(map, "footer_icp_link"),

    showWallpaper: bool(map, "show_wallpaper", true),

    loginPassword: bool(map, "login_password", true),
    loginTelegram: bool(map, "login_telegram", false),
    loginGithub: bool(map, "login_github", false),
    loginGitee: bool(map, "login_gitee", false),
    loginGoogle: bool(map, "login_google", false),
    telegramBotName: str(map, "telegram_bot_name"),
    githubClientId: str(map, "github_client_id"),
  };
}
