"use client";

import { useEffect, useState } from "react";
import type { Wallpaper } from "@/lib/wallpaper-config";

/**
 * 整页背景图层。
 *
 * 服务端只给一个中间档（1600 宽）保证首屏有图，浏览器再按自己的屏幕挑一档：
 * 360 图床同一张图能按尺寸档出图，1366 的笔记本没必要下载 2560 的大图，
 * 手机竖屏另有竖屏档。
 */
export default function WallpaperLayer({ wallpaper }: { wallpaper: Wallpaper }) {
  const [url, setUrl] = useState(wallpaper.url);

  useEffect(() => {
    const variants = wallpaper.variants ?? [];
    if (variants.length < 2) return;

    const portrait = window.innerHeight > window.innerWidth;
    // 需要的像素宽度：视口长边 × 设备像素比（比例超过 2 不给更多，收益太小）
    const need =
      Math.max(window.innerWidth, window.innerHeight) *
      Math.min(window.devicePixelRatio || 1, 2);

    const pool = variants
      .filter((v) => !!v.portrait === portrait)
      .sort((a, b) => a.px - b.px);
    const picked = pool.find((v) => v.px >= need) ?? pool[pool.length - 1];
    if (picked?.url) setUrl(picked.url);
  }, [wallpaper]);

  return (
    <div
      className="wallpaper"
      style={{ backgroundImage: `url("${url}")` }}
      aria-hidden="true"
    />
  );
}
