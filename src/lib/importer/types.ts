/**
 * 数据导入的公共类型。
 *
 * 导入分两步：
 *   1. 扫描（scan）：把来源库的数据读成一份「快照」，分类 / 内容 / 下载都是扁平的，
 *      用来源库里的原始 ID 相互关联。
 *   2. 执行（run）：用户在后台勾选要导入的分类和内容，再把快照写进 knav_* 表。
 *
 * 快照不落库，扫描到执行之间来源库变了也不要紧——反正写进去的是快照里的内容。
 */

export type ImportContentType = "site" | "article" | "app";

/** 扫描到的来源系统 */
export type ImportSourceSystem =
  | "wordpress"
  | "knav"
  | "typecho"
  | "zblog"
  | "emlog"
  | "halo"
  | "links";

/** 来源库里的一个分类 */
export interface ImportCategory {
  /** 来源库里的 term_id */
  sourceId: number;
  /** 父分类的 term_id，0 表示顶级 */
  parentSourceId: number;
  name: string;
  slug: string;
  description: string;
  /** 图标：可能是图片地址，也可能是主题写死的类名 */
  icon: string;
  count: number;
  /** 来源库里的排序权重；没有这个概念的系统为 0 */
  sortOrder?: number;
}

/** 来源库里的一个镜像下载链接 */
export interface ImportMirror {
  name: string;
  url: string;
  fileSize: string;
  note: string;
}

/** 来源库里的一个平台版本 */
export interface ImportDownload {
  platform: string;
  arch: string;
  version: string;
  fileSize: string;
  note: string;
  mirrors: ImportMirror[];
}

/** 来源库里的一条内容 */
export interface ImportContent {
  /** 来源库里的 post_id */
  sourceId: number;
  type: ImportContentType;
  title: string;
  url: string;
  description: string;
  contentMd: string;
  icon: string;
  cover: string;
  /** 主分类的 term_id（列表、面包屑用） */
  categorySourceId: number;
  /** 完整分类集合；不填则只导入主分类 */
  categorySourceIds?: number[];
  tags: string[];
  views: number;
  likes: number;
  sticky: number;
  sortOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  downloads: ImportDownload[];
  /** 备用链接 */
  links: { name: string; url: string; note: string }[];
}

/** 一次扫描的结果 */
export interface ImportSnapshot {
  /** 识别出的来源系统 */
  sourceSystem: ImportSourceSystem;
  /** 来源站点名（后台「站点名称」或库名） */
  sourceLabel: string;
  /**
   * 来源站的站点地址。
   * 来源库里存的图标常常是 `/wp-content/uploads/...` 这种相对路径，
   * 扫描时按这个地址补成绝对地址，导入后图片照样能显示。
   */
  sourceSiteUrl: string;
  categories: ImportCategory[];
  contents: ImportContent[];
  /** 扫描到的原始分类法（WordPress 里分类和标签分属不同 taxonomy） */
  taxonomies: { name: string; count: number }[];
  /**
   * 来源站可迁移的站点设置（仅外观 / 站点信息白名单）。
   * 只有 knav 来源有；密钥、站点地址等始终不在此列。
   */
  settings?: Record<string, string>;
}

/** 用户勾选的导入项 */
export interface ImportSelection {
  /** 要导入的分类 term_id（含被勾选的父分类） */
  categoryIds: number[];
  /** 要导入的内容 post_id */
  contentIds: number[];
  options: {
    /** 导入软件的平台版本与镜像链接 */
    downloads: boolean;
    /** 导入标签 */
    tags: boolean;
    /** 导入浏览量 / 点赞数 */
    counters: boolean;
    /** 草稿 / 待审核的内容按「已发布」导入 */
    publishAll: boolean;
    /** 导入分类的图标 */
    categoryIcons: boolean;
    /** 导入图标字体 CSS（分类图标里的 icon-xxx 类名依赖它） */
    settingIconfont: boolean;
    /** 导入其余外观设置（LOGO、主题、卡片、代码主题、壁纸） */
    settingAppearance: boolean;
    /** 导入站点信息与页面（名称、描述、SEO、页脚、关于/投稿说明） */
    settingProfile: boolean;
    /** 同步已存在内容的置顶与排序，而不是直接跳过 */
    updateExisting: boolean;
  };
}

/** 导入结果统计 */
export interface ImportStats {
  categories: number;
  contents: number;
  sites: number;
  articles: number;
  apps: number;
  downloads: number;
  mirrors: number;
  tags: number;
  links: number;
  skipped: number;
  /** 更新的已存在内容数 */
  updated: number;
  /** 写入的站点设置项数 */
  settings: number;
}

/** 扫描完成后返回给后台页面的摘要（完整快照留在服务端） */
export interface ImportScanResult {
  /** 本次扫描的凭据，执行导入时凭它取回快照 */
  jobId: string;
  sourceType: "mysql" | "wxr" | "sql";
  sourceSystem: ImportSourceSystem;
  sourceSystemLabel: string;
  sourceLabel: string;
  /** 从来源库里读到的站点地址，用来补全相对素材路径 */
  sourceSiteUrl: string;
  taxonomies: { name: string; count: number }[];
  categories: {
    sourceId: number;
    parentSourceId: number;
    name: string;
    count: number;
    sortOrder: number;
  }[];
  contents: {
    sourceId: number;
    type: ImportContentType;
    title: string;
    url: string;
    categorySourceId: number;
    downloadCount: number;
  }[];
  /** 来源里可导入的站点设置；没有则为 0 */
  settings: {
    iconfont: boolean;
    appearance: number;
    profile: number;
  };
  stats: {
    categories: number;
    contents: number;
    sites: number;
    articles: number;
    apps: number;
  };
}
