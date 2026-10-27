"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * iconfont 上下文。
 *
 * 服务端在 layout 里解析样式表后塞进来，客户端组件（分类图标、图标选择器）
 * 据此判断「这个值是不是图标字体类名」，并把正确的基础类套到元素上。
 */
export interface IconFontState {
  /** 字体名，如 "io" */
  fontFamily: string;
  /** 基础类名，如 "io" */
  baseClass: string;
  /** 图标类名，如 ["io-wangzhan", ...] */
  glyphs: string[];
}

export const EMPTY_ICON_FONT: IconFontState = {
  fontFamily: "",
  baseClass: "",
  glyphs: [],
};

const IconFontContext = createContext<IconFontState>(EMPTY_ICON_FONT);

export function IconFontProvider({
  value,
  children,
}: {
  value: IconFontState;
  children: ReactNode;
}) {
  return (
    <IconFontContext.Provider value={value}>{children}</IconFontContext.Provider>
  );
}

export function useIconFont(): IconFontState {
  return useContext(IconFontContext);
}
