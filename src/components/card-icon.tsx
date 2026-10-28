"use client";

import { useState } from "react";

/**
 * 卡片图标。
 *
 * 加载失败（外链图挂掉、图片被删）时回退到标题首字母，
 * 避免出现破图图标。单独抽成客户端组件，因为 onError 是事件处理器，
 * 不能直接写在服务端组件里。
 */
export default function CardIcon({
  src,
  letter,
  alt,
}: {
  src: string;
  /** 回退文字，通常是标题首字母 */
  letter: string;
  /** 图片替代文字，缺省用首字母，避免搜索引擎判定为空 alt */
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return <>{letter}</>;

  return (
    // 使用原生 img 而非 next/image：外站图片尺寸不可控，原生加载更可控
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || letter}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
