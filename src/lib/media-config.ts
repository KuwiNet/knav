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

/** 单张图片体积上限（字节） */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** 单个附件体积上限（字节）：文档、压缩包、音视频共用 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * 素材库一次多选提交的总量上限。
 * 必须小于 next.config 的 serverActions.bodySizeLimit（64mb），
 * 否则超限时 Next 会在动作执行前拒掉整个请求，用户只能看到一句笼统的报错。
 */
export const MAX_BATCH_BYTES = 60 * 1024 * 1024;

/** 人类可读的文件大小 */
export function formatSize(bytes: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * 素材能否直接当图片渲染。
 * 老记录的 mime 可能是空串，所以再看扩展名。
 */
export function isImageMedia(m: { mime: string; filename: string }): boolean {
  return (
    m.mime.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i.test(m.filename)
  );
}

/** 附件卡片上显示的后缀标签，取不到就返回 FILE */
export function fileExtLabel(filename: string): string {
  const m = filename.match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toUpperCase() : "FILE";
}
