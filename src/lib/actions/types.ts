/**
 * Server Action 通用返回类型。
 * 单独放在非 "use server" 文件里，避免 "use server" 模块导出非函数时报错。
 */
export interface FormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

export const EMPTY_STATE: FormState = {};

/** 头像面板用的状态：多带一个「当前生效的头像地址」，让预览跟着保存结果走 */
export interface AvatarState extends FormState {
  /** 保存后的头像站内地址；空串表示用默认首字母头像 */
  avatar?: string;
}

/** 内容编辑页直接上传图片的结果 */
export type AssetUploadState =
  | { ok: true; url: string }
  | { ok: false; error: string };
