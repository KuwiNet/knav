"use client";

import { useMemo } from "react";
import { CATEGORY_ICON_MAP, isImageIcon, isIconFont, iconFontClasses } from "@/lib/category-icons";
import { useIconFont } from "./iconfont-provider";

/**
 * 分类图标统一渲染。
 *
 * 后台存的 icon 字段有五种可能：
 *   1. 内置图标名（globe / server / ...）→ 渲染内置 SVG，风格统一
 *   2. 图片地址 → <img>
 *   3. iconfont（iconfont:xxx / icon-xxx / io-wangzhan）→ <i class="knav-iconfont xxx">
 *   4. Emoji / 文字 → 直接当字符渲染
 *   5. 空 → 用分类名首字母兜底
 */
export default function CategoryIcon({
  icon,
  name,
  size = 16,
  className,
}: {
  icon?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const { glyphs, baseClass } = useIconFont();
  const hints = useMemo(
    () => ({ glyphs, baseClass }),
    [glyphs, baseClass]
  );
  const v = (icon ?? "").trim();

  if (v && CATEGORY_ICON_MAP[v]) {
    const def = CATEGORY_ICON_MAP[v];
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ flexShrink: 0, display: "block" }}
      >
        {def.shapes.map((s, i) => {
          if (s.kind === "path") return <path key={i} d={s.d} />;
          if (s.kind === "circle")
            return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} />;
          if (s.kind === "rect")
            return (
              <rect
                key={i}
                x={s.x}
                y={s.y}
                width={s.w}
                height={s.h}
                rx={s.rx ?? 0}
              />
            );
          return (
            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
          );
        })}
      </svg>
    );
  }

  if (v && isIconFont(v, hints)) {
    const classes = iconFontClasses(v);
    return (
      <i
        className={`knav-iconfont ${classes.join(" ")}${className ? ` ${className}` : ""}`}
        aria-hidden="true"
        style={{ fontSize: size, lineHeight: 1, flexShrink: 0 }}
      />
    );
  }

  if (v && isImageIcon(v)) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        className={className}
        src={v}
        alt={name ?? ""}
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }}
      />
    );
  }

  if (v) {
    return (
      <span
        className={className}
        aria-hidden="true"
        style={{ fontSize: size, lineHeight: 1, flexShrink: 0 }}
      >
        {v}
      </span>
    );
  }

  const letter = (name ?? "?").trim().charAt(0) || "?";
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        fontSize: Math.max(11, Math.round(size * 0.72)),
        fontWeight: 700,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {letter.toUpperCase()}
    </span>
  );
}
