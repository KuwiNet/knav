/**
 * 壁纸相关的前端可共享定义。
 *
 * 这个文件不能引入 server-only 或数据库相关模块，
 * 因为后台设置表单（客户端组件）需要用到下面的常量。
 */

export type WallpaperSource = "none" | "bing" | "xiaoniao" | "random" | "custom";
export type WallpaperMask = "none" | "light" | "normal" | "strong";
/** 壁纸更换频率：每天一张 / 每次刷新换一张 */
export type WallpaperRefresh = "daily" | "each_view";

export interface WallpaperSettings {
  source: WallpaperSource;
  customUrl: string;
  mask: WallpaperMask;
  refresh: WallpaperRefresh;
  /** 「小鸟壁纸」参与随机的 360 分类编号 */
  cids: number[];
}

/** 一张壁纸的某个尺寸档：px = 这一档的图片宽度 */
export interface WallpaperVariant {
  px: number;
  url: string;
  /** 竖屏（手机）专用的档 */
  portrait?: boolean;
}

export interface Wallpaper {
  url: string;
  source: WallpaperSource;
  title: string;
  link: string;
  /** 同一张图的多个尺寸档；只有 360 图床能给出来，其它来源为空 */
  variants: WallpaperVariant[];
}

export const WALLPAPER_MASKS: { value: WallpaperMask; label: string }[] = [
  { value: "none", label: "无遮罩" },
  { value: "light", label: "轻" },
  { value: "normal", label: "适中" },
  { value: "strong", label: "深" },
];

export const WALLPAPER_REFRESHES: { value: WallpaperRefresh; label: string; hint: string }[] = [
  { value: "daily", label: "每天一张", hint: "同一天里刷新都是同一张" },
  { value: "each_view", label: "每次刷新换一张", hint: "刷新就换，随机感更强" },
];

/**
 * 360 壁纸的分类编号与名称。
 * 名称取自接口 c=WallPaper&a=getAllCategoriesV2（实测 cid=9 的图 tag 结尾就是「风景大片」）。
 */
export const WALLPAPER_360_CIDS: { cid: number; name: string }[] = [
  { cid: 5, name: "游戏壁纸" },
  { cid: 6, name: "美女模特" },
  { cid: 7, name: "影视剧照" },
  { cid: 9, name: "风景大片" },
  { cid: 10, name: "炫酷时尚" },
  { cid: 11, name: "明星风尚" },
  { cid: 14, name: "萌宠动物" },
  { cid: 30, name: "爱情美图" },
  { cid: 36, name: "4K专区" },
  { cid: 15, name: "小清新" },
  { cid: 26, name: "动漫卡通" },
];

/** 默认参与随机的分类（后台一个都不勾时也按这一组来） */
export const WALLPAPER_360_DEFAULT_CIDS = WALLPAPER_360_CIDS.map((c) => c.cid);

export const WALLPAPER_SOURCES: { value: WallpaperSource; label: string; hint: string }[] = [
  { value: "none", label: "不启用", hint: "纯色背景" },
  { value: "bing", label: "Bing 每日壁纸", hint: "bing.com 每日一图，每天自动更新" },
  { value: "xiaoniao", label: "小鸟壁纸", hint: "360 壁纸分类接口随机取图，按屏幕大小选尺寸" },
  { value: "random", label: "随机风景", hint: "picsum.photos 随机照片" },
  { value: "custom", label: "自定义图片", hint: "填自己的图片地址" },
];
