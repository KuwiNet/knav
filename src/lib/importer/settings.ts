import type { ImportSelection } from "./types";

/**
 * 站点设置里允许跟着内容一起迁移的白名单。
 *
 * 站点地址固定保留目标站自己的；SMTP / OAuth / YOURLS / Telegram 密钥、
 * 登录开关、统计与页头页尾脚本都不导入，避免迁移时带过去另一套凭据或代码。
 */
export const ICONFONT_SETTING_KEYS = ["iconfont_css"] as const;

export const APPEARANCE_SETTING_KEYS = [
  "logo_url",
  "favicon_url",
  "logo_size",
  "logo_show_name",
  "theme_mode",
  "card_style",
  "card_radius",
  "card_columns",
  "card_density",
  "card_fixed_height",
  "card_title_lines",
  "card_show_category",
  "card_show_type",
  "card_show_views",
  "card_show_tags",
  "card_icon_mode",
  "code_theme",
  "code_show_copy",
  "code_show_lang",
  "code_inline_style",
  "show_wallpaper",
  "wallpaper_source",
  "wallpaper_custom",
  "wallpaper_refresh",
  "wallpaper_cids",
  "wallpaper_mask",
] as const;

export const PROFILE_SETTING_KEYS = [
  "site_name",
  "site_short_name",
  "site_description",
  "site_keywords",
  "icp",
  "seo_title",
  "seo_description",
  "seo_keywords",
  "seo_og_image",
  "seo_verification",
  "seo_robots",
  "seo_sitemap",
  "seo_noindex",
  "footer_copyright",
  "footer_powered",
  "footer_note",
  "footer_links",
  "footer_icp_link",
  "about_content",
  "contribute_content",
] as const;

const ICONFONT_KEYS = new Set<string>(ICONFONT_SETTING_KEYS);
const APPEARANCE_KEYS = new Set<string>(APPEARANCE_SETTING_KEYS);
const PROFILE_KEYS = new Set<string>(PROFILE_SETTING_KEYS);

export const IMPORTABLE_SETTING_KEYS = new Set<string>([
  ...ICONFONT_KEYS,
  ...APPEARANCE_KEYS,
  ...PROFILE_KEYS,
]);

/** 后台扫描结果里展示“来源有多少项可导入设置” */
export function countImportableSettings(
  settings: Record<string, string> | undefined
): { iconfont: boolean; appearance: number; profile: number } {
  let appearance = 0;
  let profile = 0;
  let iconfont = false;
  for (const key of Object.keys(settings ?? {})) {
    if (ICONFONT_KEYS.has(key)) iconfont = true;
    else if (APPEARANCE_KEYS.has(key)) appearance++;
    else if (PROFILE_KEYS.has(key)) profile++;
  }
  return { iconfont, appearance, profile };
}

/** 按用户勾选拼出本次要写入的设置项 */
export function selectImportableSettings(
  settings: Record<string, string> | undefined,
  options: ImportSelection["options"]
): Record<string, string> {
  if (!settings) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!IMPORTABLE_SETTING_KEYS.has(key)) continue;
    const on = ICONFONT_KEYS.has(key)
      ? options.settingIconfont
      : APPEARANCE_KEYS.has(key)
        ? options.settingAppearance
        : options.settingProfile && PROFILE_KEYS.has(key);
    if (on) out[key] = value;
  }
  return out;
}
