/**
 * 头像的前端可共享定义（内置头像清单、体积上限）。
 * 不能从 media.ts 引入（那边带 server-only 守卫）。
 */

/** 用户上传头像的体积上限 */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export interface AvatarPreset {
  key: string;
  label: string;
  /** 站内路径，SVG 直接放在 public/avatars 下 */
  url: string;
}

/**
 * 系统内置头像：随包分发的一组扁平插画，不涉及第三方版权图。
 * 用户不上传也能一键换头像。
 */
export const AVATAR_PRESETS: AvatarPreset[] = [
  { key: "panda", label: "熊猫", url: "/avatars/panda.svg" },
  { key: "fox", label: "狐狸", url: "/avatars/fox.svg" },
  { key: "cat", label: "猫咪", url: "/avatars/cat.svg" },
  { key: "robot", label: "机器人", url: "/avatars/robot.svg" },
  { key: "star", label: "星星", url: "/avatars/star.svg" },
  { key: "moon", label: "月亮", url: "/avatars/moon.svg" },
  { key: "cloud", label: "云朵", url: "/avatars/cloud.svg" },
  { key: "bolt", label: "闪电", url: "/avatars/bolt.svg" },
  { key: "leaf", label: "叶子", url: "/avatars/leaf.svg" },
  { key: "wave", label: "海浪", url: "/avatars/wave.svg" },
  { key: "planet", label: "行星", url: "/avatars/planet.svg" },
  { key: "gem", label: "宝石", url: "/avatars/gem.svg" },
];

/** 是不是内置头像地址（用来在挑选器里高亮当前选中项） */
export function isPresetAvatar(url: string): boolean {
  return AVATAR_PRESETS.some((p) => p.url === url.trim());
}
