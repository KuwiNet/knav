/**
 * 后台内容详情（客户端可共享的类型定义）。
 * 具体数据由 admin.ts 从 WordPress 表里读出。
 */

export interface AdminContentDetail {
  id: number;
  type: "site" | "article" | "app";
  title: string;
  url: string;
  description: string;
  contentMd: string;
  /** 主分类（knav_contents.category_id） */
  categoryId: number;
  /** 全部关联分类，主分类排在最前 */
  categoryIds: number[];
  tags: string;
  icon: string;
  cover: string;
  order: number;
  sticky: number;
  status: string;
  date: string;
  version: string;
  platform: string;
  /** 同一个软件的多平台版本 */
  versions: PlatformVersion[];
}

/**
 * 软件的一个平台版本。
 *
 * 一个软件（内容）可以挂多个平台版本，每个平台版本下可以有多个镜像下载链接。
 * 这里的 name / url 指「主镜像」（sort 最小的那条），内容管理页只编辑主镜像，
 * 其余镜像（网盘、应用商店等）在「下载管理」里维护。
 */
export interface PlatformVersion {
  /** 已存在的平台版本 ID（knav_downloads.id）；新增行没有，保存时按它匹配以免误删镜像 */
  id?: number;
  /** 主镜像名称，如「官方下载」「百度网盘」 */
  name: string;
  /** 平台：Windows / macOS / Linux / Android / iOS / Web / HarmonyOS */
  platform: string;
  /** 架构：x64 / x86 / ARM64 / universal …，留空表示不限 */
  arch: string;
  /** 版本号 */
  version: string;
  /** 主镜像下载地址 */
  url: string;
  /** 文件大小 */
  fileSize: string;
  /** 该平台下的镜像总数（含主镜像） */
  mirrorCount?: number;
}

/** 平台版本下的一个镜像下载链接 */
export interface DownloadMirror {
  id: number;
  /** 镜像名称：官方下载 / 百度网盘 / 123网盘 / App Store / Google Play / App Gallery … */
  name: string;
  url: string;
  fileSize: string;
  /** 备注，如网盘提取码 */
  note: string;
  enabled: number;
  count: number;
  sort: number;
}

/** 常用镜像名称，后台表单里做成下拉联想 */
export const MIRROR_PRESETS = [
  "官方下载",
  "百度网盘",
  "123网盘",
  "阿里云盘",
  "天翼云盘",
  "夸克网盘",
  "迅雷云盘",
  "蓝奏云",
  "App Store",
  "Google Play",
  "App Gallery",
  "华为应用市场",
  "小米应用商店",
  "应用宝",
  "GitHub",
  "Gitee",
] as const;

/** 常用平台名称 */
export const PLATFORM_PRESETS = [
  "Windows",
  "macOS",
  "Linux",
  "OpenWrt",
  "Android",
  "iOS",
  "HarmonyOS",
  "Web",
  "通用",
] as const;

/**
 * 平台的下属选项：CPU 架构。
 * 同一个平台可以同时挂 x64 与 ARM64 两条（比如 Windows 的安装包和 ARM 版、
 * macOS 的 Intel 和 Apple Silicon），留空表示该条不区分架构。
 */
export const ARCH_PRESETS = [
  "x64",
  "x86",
  "ARM64",
  "ARM32",
  "Apple Silicon",
  "Intel",
  "universal",
  "mips",
  "mipsle",
  "mips64",
  "riscv64",
  "aarch64_cortex-a53",
  "mipsel_24kc",
  "armsr_armv7",
] as const;
