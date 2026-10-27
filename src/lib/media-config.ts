/**
 * 素材库的前端可共享定义。
 * 不能从 media.ts 引入（那边带 server-only 守卫），单独放这里。
 */

export interface MediaItem {
  id: number;
  filename: string;
  path: string;
  url: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  alt: string;
  sourceUrl: string;
  createdAt: string;
}

/** 人类可读的文件大小 */
export function formatSize(bytes: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
