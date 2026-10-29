/**
 * 站点设置注册表（客户端安全）。
 *
 * 这里只放"纯数据"：分组、字段定义、默认值、候选项。
 * 后台表单是客户端组件，需要 import 这些定义；
 * 而 `src/lib/settings.ts` 带 server-only 守卫（要连数据库），
 * 两者混用会导致 `server-only` 被打进客户端包而运行时报错。
 *
 * 因此：定义放这里，读写放 settings.ts，单一数据源。
 */

// 同样是纯数据（客户端安全），壁纸分类编号在那里维护，这里只做选项
import { WALLPAPER_360_CIDS } from "./wallpaper-config";
import { MAIL_SCENES } from "./mail-templates";

export type SettingType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "switch"
  | "password"
  | "color"
  /** 多选：提交时把勾选项拼成逗号分隔串 */
  | "checkboxes";

export interface SettingGroupDef {
  key: string;
  label: string;
  hint?: string;
}

export interface SettingField {
  key: string;
  label: string;
  type: SettingType;
  group: string;
  default: string;
  options?: { value: string; label: string }[];
  hint?: string;
  placeholder?: string;
  rows?: number;
  /** 开关类：说明关闭时的后果 */
  danger?: boolean;
}

/** 设置分组（后台按标签页展示） */
export const SETTING_GROUPS: SettingGroupDef[] = [
  { key: "basic", label: "基础信息" },
  { key: "logo", label: "LOGO 与图标" },
  { key: "appearance", label: "外观与卡片" },
  { key: "shortlink", label: "短网址（YOURLS）" },
  { key: "code", label: "代码块" },
  { key: "seo", label: "SEO" },
  { key: "footer", label: "页脚与版权" },
  { key: "pages", label: "页面内容", hint: "「关于本站」与「投稿须知」的正文，支持 Markdown；留空保存会恢复默认内容。" },
  { key: "ads", label: "广告栏" },
  { key: "announce", label: "公告与开关" },
  { key: "wallpaper", label: "站点壁纸" },
  { key: "analytics", label: "统计与代码" },
  { key: "login", label: "登录方式" },
  { key: "mail", label: "邮件（SMTP）" },
  { key: "mail_tpl", label: "邮件模版", hint: "每封邮件都会套用统一外壳（站点 LOGO、名称、标题、页脚）。主题与正文里的 {{site}}、{{username}} 等占位符会在发送时自动替换；正文支持 HTML，清空保存即恢复内置默认模版。" },
];

/** 卡片风格可选值 */
export const CARD_STYLES = [
  { value: "shadow", label: "阴影卡片" },
  { value: "border", label: "描边卡片" },
  { value: "plain", label: "极简卡片" },
];

/**
 * 走 OAuth2 的登录方式。
 * 来源应用后台要登记的「回调地址」= 站点地址 + /api/auth/<key>/callback，
 * 后台设置页按这个规则把真实地址显示出来，用户直接复制，不用自己拼域名。
 */
export const OAUTH_CALLBACK_PROVIDERS: { key: string; label: string; where: string }[] = [
  { key: "github", label: "GitHub", where: "OAuth Apps → Authorization callback URL" },
  { key: "gitee", label: "Gitee", where: "应用详情 → 授权回调地址" },
  { key: "google", label: "Google", where: "凭据 → 已获授权的重定向 URI" },
];

/** 代码块主题（自绘 CSS，不引第三方高亮库） */
export const CODE_THEMES = [
  { value: "github", label: "GitHub 浅色" },
  { value: "dracula", label: "Dracula" },
  { value: "monokai", label: "Monokai" },
  { value: "one-dark", label: "One Dark" },
  { value: "solarized", label: "Solarized Dark" },
  { value: "nord", label: "Nord" },
];

/** 「关于本站」默认正文（Markdown） */
export const DEFAULT_ABOUT_CONTENT = `knav 是一个为了方便上网更快捷的一键直达而建立的网址收藏网站，网站完全是非盈利性质，全部内容均来自网络和网友投稿。

## 内容组织

站点使用一套统一的分类体系，**网址收藏**与**文章**共用同一批分类。在同一个分类页里，两种内容会以完全一致的卡片样式混排展示，方便在一个主题下同时找到「直达入口」和「深度说明」。

## 投稿与审核

- 注册后需要通过邮箱验证，才能登录并投稿。
- 文章支持 Markdown 语法，提交前可在页面上实时预览。
- 所有投稿都会进入审核队列，审核结果通过站内通知与邮件同时告知。
- 审核通过的内容会自动发布到对应分类，并显示作者提交的标签。

## 免责声明

站内内容全部来自网络分享与网友投稿，本站仅收录优质资源，不保证外部链接的准确性与完整性，也不为第三方站点承担任何责任。如侵犯到您的权利，请联系反馈邮箱，我们会尽快删除相应内容。`;

/** 「投稿须知」默认正文（Markdown） */
export const DEFAULT_CONTRIBUTE_CONTENT = `## 一、账号

- 点击右上角「注册」创建账号，填写用户名、邮箱与密码。
- 注册后系统会发送验证邮件，24 小时内点击链接完成验证才能登录。
- 投稿、收藏、接收审核通知都依赖验证后的邮箱，请确保邮箱可用。

## 二、投稿类型

- **网址收藏**：填写名称、网址、简介与图标地址，提交后会在对应分类中以卡片形式展示，点击可直接跳转。
- **文章**：使用 Markdown 书写正文，支持标题、列表、表格、代码块、引用、链接与图片，提交前有实时预览。

## 三、分类与标签

网址与文章使用同一套分类，选择最贴切的分类即可；标签用英文逗号分隔，例如 \`VPS, 教程, 开源\`，最多 10 个。标签会在审核通过时自动创建或复用。

## 四、审核

- 投稿提交后进入待审核状态，可在「个人中心 → 我的投稿」中查看进度。
- 待审核期间可以自行撤回。
- 审核结果会通过站内通知和邮件同时通知你，通过的内容会自动发布。
- 若未通过，请根据审核意见调整后重新投稿。

## 五、内容要求

- 只收录长期可用、无违规内容的资源。
- 简介请用一到两句话说明用途，便于他人判断是否需要。
- 不要提交与已有内容重复的条目。
- 涉及版权、隐私的内容请自行确认已获授权。`;

export const SETTINGS_FIELDS: SettingField[] = [
  /* ---------------------------------------------------------- 基础信息 */
  {
    key: "site_name",
    label: "站点名称",
    type: "text",
    group: "basic",
    default: "knav 导航站",
    hint: "显示在浏览器标题与页脚",
  },
  {
    key: "site_short_name",
    label: "站点简称",
    type: "text",
    group: "basic",
    default: "knav",
    hint: "顶栏 LOGO 旁的文字",
  },
  {
    key: "site_description",
    label: "站点描述",
    type: "textarea",
    group: "basic",
    default: "knav - 优质网络站点资源收集与分享，网址收藏、技术教程与软件下载。",
    rows: 3,
  },
  {
    key: "site_url",
    label: "站点地址",
    type: "text",
    group: "basic",
    default: "http://localhost:3000",
    hint: "用于邮件里的验证链接、找回密码链接与 LOGO，以及站点地图、OAuth 回调地址；优先于 SITE_URL 环境变量",
  },
  {
    key: "site_keywords",
    label: "站点关键词",
    type: "text",
    group: "basic",
    default: "导航,网址收藏,资源分享,技术教程,软件下载",
    hint: "多个关键词用英文逗号分隔",
  },
  {
    key: "icp",
    label: "备案号",
    type: "text",
    group: "basic",
    default: "",
  },

  /* ---------------------------------------------------------- 短网址 */
  {
    key: "yourls_enabled",
    label: "启用直达短网址",
    type: "switch",
    group: "shortlink",
    default: "1",
    hint: "配置好 API 地址与签名后，保存网址时会同时生成短链存入数据库，「直达」直接用这条短链；文章不受影响。关掉后新保存不再生成，已生成的短链仍可用。",
  },
  {
    key: "yourls_api_url",
    label: "YOURLS API 地址",
    type: "text",
    group: "shortlink",
    default: "",
    placeholder: "https://your-domain.com/yourls-api.php",
    hint: "填 YOURLS 根目录下 yourls-api.php 的完整地址",
  },
  {
    key: "yourls_signature",
    label: "Secret Signature Token",
    type: "password",
    group: "shortlink",
    default: "",
    hint: "YOURLS 后台「工具 → 签名 Token」里复制；只用于服务端生成短链，不会出现在前台页面",
  },

  /* ---------------------------------------------------------- LOGO */
  {
    key: "logo_url",
    label: "站点 LOGO",
    type: "text",
    group: "logo",
    default: "/logo.png",
    hint: "可填站内路径或外链地址，也可在素材库上传后复制地址",
  },
  {
    key: "favicon_url",
    label: "favicon",
    type: "text",
    group: "logo",
    default: "/icon.png",
    hint: "浏览器标签页图标",
  },
  {
    key: "logo_size",
    label: "LOGO 尺寸",
    type: "select",
    group: "logo",
    default: "28",
    options: [
      { value: "24", label: "24 px" },
      { value: "28", label: "28 px" },
      { value: "32", label: "32 px" },
      { value: "36", label: "36 px" },
      { value: "40", label: "40 px" },
    ],
  },
  {
    key: "logo_show_name",
    label: "顶栏显示站点简称",
    type: "switch",
    group: "logo",
    default: "1",
  },
  {
    key: "iconfont_css",
    label: "图标字体 CSS",
    type: "text",
    group: "logo",
    default: "",
    placeholder: "https://cdn.jsdelivr.net/npm/iconfont/.../iconfont.css",
    hint: "iconfont 图标库的样式表地址。保存后分类图标里会多出一排图标字体宫格，直接点选即可",
  },

  /* ---------------------------------------------------------- 外观 */
  {
    key: "theme_mode",
    label: "站点主题",
    type: "select",
    group: "appearance",
    default: "system",
    options: [
      { value: "system", label: "跟随系统" },
      { value: "light", label: "浅色" },
      { value: "dark", label: "深色" },
    ],
    hint: "前台默认主题。访客点右下角按钮手动切换后以其选择为准；修改此处会清除访客上次的手动选择",
  },
  {
    key: "card_style",
    label: "卡片风格",
    type: "select",
    group: "appearance",
    default: "shadow",
    options: CARD_STYLES,
  },
  {
    key: "card_radius",
    label: "卡片圆角",
    type: "select",
    group: "appearance",
    default: "12",
    options: [
      { value: "0", label: "直角" },
      { value: "6", label: "6 px" },
      { value: "10", label: "10 px" },
      { value: "12", label: "12 px" },
      { value: "16", label: "16 px" },
      { value: "20", label: "20 px" },
    ],
  },
  {
    key: "card_columns",
    label: "每行卡片数",
    type: "select",
    group: "appearance",
    default: "auto",
    options: [
      { value: "auto", label: "自适应" },
      { value: "3", label: "3 列" },
      { value: "4", label: "4 列" },
      { value: "5", label: "5 列" },
      { value: "6", label: "6 列" },
    ],
  },
  {
    key: "card_density",
    label: "卡片密度",
    type: "select",
    group: "appearance",
    default: "normal",
    options: [
      { value: "compact", label: "紧凑" },
      { value: "normal", label: "标准" },
      { value: "loose", label: "宽松" },
    ],
  },
  {
    key: "card_fixed_height",
    label: "卡片统一高度",
    type: "switch",
    group: "appearance",
    default: "1",
    hint: "关闭后卡片按内容自适应",
  },
  {
    key: "card_title_lines",
    label: "标题行数",
    type: "select",
    group: "appearance",
    default: "1",
    options: [
      { value: "1", label: "1 行" },
      { value: "2", label: "2 行" },
    ],
  },
  {
    key: "card_show_category",
    label: "卡片显示分类",
    type: "switch",
    group: "appearance",
    default: "1",
  },
  {
    key: "card_show_type",
    label: "卡片显示类型标签",
    type: "switch",
    group: "appearance",
    default: "1",
  },
  {
    key: "card_show_views",
    label: "卡片显示浏览量",
    type: "switch",
    group: "appearance",
    default: "1",
  },
  {
    key: "card_show_tags",
    label: "卡片显示标签",
    type: "switch",
    group: "appearance",
    default: "0",
  },
  {
    key: "card_icon_mode",
    label: "卡片图标来源",
    type: "select",
    group: "appearance",
    default: "auto",
    options: [
      { value: "auto", label: "优先自定义图标，没有则用首图/首字母" },
      { value: "letter", label: "始终用标题首字母" },
    ],
  },

  /* ---------------------------------------------------------- 代码块 */
  {
    key: "code_theme",
    label: "代码块主题",
    type: "select",
    group: "code",
    default: "github",
    options: CODE_THEMES,
  },
  {
    key: "code_show_copy",
    label: "代码块显示复制按钮",
    type: "switch",
    group: "code",
    default: "1",
  },
  {
    key: "code_show_lang",
    label: "代码块显示语言标签",
    type: "switch",
    group: "code",
    default: "1",
  },
  {
    key: "code_inline_style",
    label: "行内代码样式",
    type: "select",
    group: "code",
    default: "soft",
    options: [
      { value: "soft", label: "浅底圆角" },
      { value: "badge", label: "胶囊标签" },
      { value: "underline", label: "下划线" },
    ],
  },

  /* ---------------------------------------------------------- SEO */
  {
    key: "seo_title",
    label: "标题模板",
    type: "text",
    group: "seo",
    default: "%s | knav 导航站",
    hint: "%s 会被替换成页面标题",
  },
  {
    key: "seo_description",
    label: "默认描述",
    type: "textarea",
    group: "seo",
    default: "",
    rows: 3,
  },
  {
    key: "seo_keywords",
    label: "默认关键词",
    type: "text",
    group: "seo",
    default: "",
  },
  {
    key: "seo_og_image",
    label: "分享图（OG Image）",
    type: "text",
    group: "seo",
    default: "",
    hint: "留空则使用站点 LOGO",
  },
  {
    key: "seo_verification",
    label: "站点验证代码",
    type: "textarea",
    group: "seo",
    default: "",
    rows: 3,
    hint: "百度/Google 站点验证的 meta 标签",
  },
  {
    key: "seo_robots",
    label: "robots.txt 内容",
    type: "textarea",
    group: "seo",
    default: "User-agent: *\nAllow: /",
    rows: 4,
  },
  {
    key: "seo_sitemap",
    label: "生成站点地图",
    type: "switch",
    group: "seo",
    default: "1",
    hint: "开启后访问 /sitemap.xml",
  },
  {
    key: "seo_noindex",
    label: "搜索引擎不收录",
    type: "switch",
    group: "seo",
    default: "0",
    danger: true,
  },

  /* ---------------------------------------------------------- 页脚 */
  {
    key: "footer_copyright",
    label: "版权文案",
    type: "text",
    group: "footer",
    default: "knav",
    hint: "显示为 Copyright © 年份 文案",
  },
  {
    key: "footer_powered",
    label: "显示 Powered by knav",
    type: "switch",
    group: "footer",
    default: "1",
    hint: "显示在版权信息后，链接到 knav 开源仓库",
  },
  {
    key: "footer_note",
    label: "页脚说明",
    type: "text",
    group: "footer",
    default: "站点内容来自网络分享，仅收录优质资源，不保证外部链接的准确性与完整性。",
  },
  {
    key: "footer_links",
    label: "页脚额外链接",
    type: "textarea",
    group: "footer",
    default: "",
    rows: 4,
    hint: "每行一条，格式：名称|https://地址",
  },
  {
    key: "footer_icp_link",
    label: "备案查询链接",
    type: "text",
    group: "footer",
    default: "https://beian.miit.gov.cn/",
  },

  /* ---------------------------------------------------------- 页面内容 */
  {
    key: "about_content",
    label: "关于本站",
    type: "textarea",
    group: "pages",
    default: DEFAULT_ABOUT_CONTENT,
    rows: 14,
    hint: "支持 Markdown；留空保存恢复默认内容",
  },
  {
    key: "contribute_content",
    label: "投稿须知",
    type: "textarea",
    group: "pages",
    default: DEFAULT_CONTRIBUTE_CONTENT,
    rows: 14,
    hint: "支持 Markdown；留空保存恢复默认内容",
  },

  /* ---------------------------------------------------------- 广告 */
  {
    key: "ad_enabled",
    label: "启用广告栏",
    type: "switch",
    group: "ads",
    default: "0",
  },
  {
    key: "ad_position",
    label: "广告位置",
    type: "select",
    group: "ads",
    default: "home_bottom",
    options: [
      { value: "home_top", label: "首页顶部" },
      { value: "home_bottom", label: "首页底部" },
      { value: "detail_top", label: "详情页顶部" },
      { value: "sidebar", label: "侧栏" },
    ],
  },
  {
    key: "ad_html",
    label: "广告代码",
    type: "textarea",
    group: "ads",
    default: "",
    rows: 5,
    hint: "支持 HTML / 广告联盟脚本",
  },

  /* ---------------------------------------------------------- 公告与开关 */
  {
    key: "site_open",
    label: "站点开放",
    type: "switch",
    group: "announce",
    default: "1",
    danger: true,
    hint: "关闭后除管理员外全部看到维护页",
  },
  {
    key: "announcement",
    label: "站点公告",
    type: "textarea",
    group: "announce",
    default: "",
    rows: 3,
  },
  {
    key: "announcement_enabled",
    label: "显示公告",
    type: "switch",
    group: "announce",
    default: "1",
  },
  {
    key: "allow_register",
    label: "允许注册",
    type: "switch",
    group: "announce",
    default: "1",
  },
  {
    key: "allow_submit",
    label: "允许投稿",
    type: "switch",
    group: "announce",
    default: "1",
  },
  {
    key: "allow_favorite",
    label: "允许收藏",
    type: "switch",
    group: "announce",
    default: "1",
  },
  {
    key: "show_wallpaper",
    label: "启用站点壁纸",
    type: "switch",
    group: "announce",
    default: "1",
  },

  /* ---------------------------------------------------------- 站点壁纸 */
  {
    key: "wallpaper_source",
    label: "壁纸来源",
    type: "select",
    group: "wallpaper",
    default: "none",
    options: [
      { value: "none", label: "不启用（纯色背景）" },
      { value: "bing", label: "Bing 每日壁纸（每天自动更新）" },
      { value: "xiaoniao", label: "小鸟壁纸（360 分类随机一张）" },
      { value: "random", label: "随机风景（picsum.photos）" },
      { value: "custom", label: "自定义图片" },
    ],
  },
  {
    key: "wallpaper_custom",
    label: "自定义壁纸地址",
    type: "text",
    group: "wallpaper",
    default: "",
    placeholder: "https://example.com/wallpaper.jpg",
    hint: "仅当壁纸来源选择「自定义图片」时生效",
  },
  {
    key: "wallpaper_refresh",
    label: "小鸟壁纸更换频率",
    type: "select",
    group: "wallpaper",
    default: "daily",
    options: [
      { value: "daily", label: "每天一张（当天刷新都是同一张）" },
      { value: "each_view", label: "每次刷新换一张" },
    ],
    hint: "只影响「小鸟壁纸」；Bing 壁纸本身就是一天一换",
  },
  {
    key: "wallpaper_cids",
    label: "小鸟壁纸分类",
    type: "checkboxes",
    group: "wallpaper",
    default: "5,6,7,9,10,11,14,30,36,15,26",
    options: WALLPAPER_360_CIDS.map((c) => ({
      value: String(c.cid),
      label: `${c.name}（${c.cid}）`,
    })),
    hint: "随机从勾选的分类里取一张，并随机取该分类内的偏移位置；一个都不勾就按全部分类来",
  },
  {
    key: "wallpaper_mask",
    label: "遮罩浓度",
    type: "select",
    group: "wallpaper",
    default: "normal",
    options: [
      { value: "none", label: "无遮罩" },
      { value: "light", label: "轻" },
      { value: "normal", label: "适中" },
      { value: "strong", label: "深" },
    ],
    hint: "遮罩越重，正文越清晰，壁纸越不明显",
  },

  /* ---------------------------------------------------------- 统计与代码 */
  {
    key: "analytics_code",
    label: "统计代码",
    type: "textarea",
    group: "analytics",
    default: "",
    rows: 5,
    hint: "如 Google Analytics、百度统计、Umami 等",
  },
  {
    key: "head_code",
    label: "自定义 head 代码",
    type: "textarea",
    group: "analytics",
    default: "",
    rows: 4,
  },
  {
    key: "body_code",
    label: "自定义 body 代码",
    type: "textarea",
    group: "analytics",
    default: "",
    rows: 4,
  },

  /* ---------------------------------------------------------- 登录方式 */
  {
    key: "login_password",
    label: "账号密码登录",
    type: "switch",
    group: "login",
    default: "1",
  },
  {
    key: "login_telegram",
    label: "Telegram 登录",
    type: "switch",
    group: "login",
    default: "0",
  },
  {
    key: "telegram_bot_token",
    label: "Telegram Bot Token",
    type: "password",
    group: "login",
    default: "",
    hint: "从 @BotFather 获取，仅用于服务端校验登录签名",
  },
  {
    key: "telegram_bot_name",
    label: "Telegram Bot 名称",
    type: "text",
    group: "login",
    default: "",
    hint: "填 Bot 用户名（不带 @）；还需在 @BotFather 用 /setdomain 把本站域名设为该 Bot 的登录域名",
  },
  {
    key: "login_github",
    label: "GitHub 登录",
    type: "switch",
    group: "login",
    default: "0",
  },
  {
    key: "github_client_id",
    label: "GitHub Client ID",
    type: "text",
    group: "login",
    default: "",
    hint: "回调地址用下面「OAuth 回调地址」里 GitHub 那一行",
  },
  {
    key: "github_client_secret",
    label: "GitHub Client Secret",
    type: "password",
    group: "login",
    default: "",
  },
  {
    key: "login_gitee",
    label: "Gitee 登录",
    type: "switch",
    group: "login",
    default: "0",
  },
  {
    key: "gitee_client_id",
    label: "Gitee Client ID",
    type: "text",
    group: "login",
    default: "",
    hint: "回调地址用下面「OAuth 回调地址」里 Gitee 那一行",
  },
  {
    key: "gitee_client_secret",
    label: "Gitee Client Secret",
    type: "password",
    group: "login",
    default: "",
  },
  {
    key: "login_google",
    label: "Google 登录",
    type: "switch",
    group: "login",
    default: "0",
  },
  {
    key: "google_client_id",
    label: "Google Client ID",
    type: "text",
    group: "login",
    default: "",
    hint: "回调地址用下面「OAuth 回调地址」里 Google 那一行",
  },
  {
    key: "google_client_secret",
    label: "Google Client Secret",
    type: "password",
    group: "login",
    default: "",
  },

  /* ---------------------------------------------------------- 邮件 */
  {
    key: "smtp_host",
    label: "SMTP 服务器",
    type: "text",
    group: "mail",
    default: "",
  },
  {
    key: "smtp_port",
    label: "SMTP 端口",
    type: "text",
    group: "mail",
    default: "465",
  },
  {
    key: "smtp_user",
    label: "SMTP 账号",
    type: "text",
    group: "mail",
    default: "",
  },
  {
    key: "smtp_pass",
    label: "SMTP 密码 / 授权码",
    type: "password",
    group: "mail",
    default: "",
  },
  {
    key: "smtp_from",
    label: "发件地址",
    type: "text",
    group: "mail",
    default: "",
  },
  {
    key: "smtp_from_name",
    label: "发件人名称",
    type: "text",
    group: "mail",
    default: "knav",
  },

  /* ------------------------------------------------------ 邮件模版（按场景生成） */
  ...MAIL_SCENES.flatMap((s): SettingField[] => {
    const ph = s.placeholders.map((p) => `{{${p.name}}} ${p.desc}`).join("；");
    return [
      {
        key: `mail_tpl_${s.key}_subject`,
        label: `${s.label} · 主题`,
        type: "text",
        group: "mail_tpl",
        default: s.defaultSubject,
        hint: `${s.when}可用占位符：${ph}。`,
      },
      {
        key: `mail_tpl_${s.key}_body`,
        label: `${s.label} · 正文`,
        type: "textarea",
        group: "mail_tpl",
        default: s.defaultBody,
        rows: 9,
        hint: `支持 HTML，可用占位符：${ph}。清空保存则恢复内置默认模版。`,
      },
    ];
  }),
];

/** 键 → 定义 */
export const SETTING_MAP: Record<string, SettingField> = Object.fromEntries(
  SETTINGS_FIELDS.map((f) => [f.key, f])
);

/** 所有已知键（按定义顺序） */
export const SETTING_KEYS = SETTINGS_FIELDS.map((f) => f.key);

/** 默认值表 */
export const SETTING_DEFAULTS: Record<string, string> = Object.fromEntries(
  SETTINGS_FIELDS.map((f) => [f.key, f.default])
);
