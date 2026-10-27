"use client";

import { useMemo, useState } from "react";
import {
  CATEGORY_ICONS,
  CATEGORY_ICON_MAP,
  isIconFont,
  isImageIcon,
} from "@/lib/category-icons";
import CategoryIcon from "@/components/category-icon";
import { useIconFont } from "@/components/iconfont-provider";

/**
 * 分类图标选择器。
 *
 * 一个输入框存最终值（图标名 / 图片地址 / Emoji 都行），
 * 下面的图标宫格点一下就把名字填进去，风格统一；
 * 图片地址保存时会自动本地化。
 */
export default function IconPicker({
  name,
  value,
}: {
  name: string;
  value?: string;
}) {
  const [icon, setIcon] = useState(value ?? "");
  const { glyphs, baseClass } = useIconFont();
  const hints = useMemo(() => ({ glyphs, baseClass }), [glyphs, baseClass]);

  const v = icon.trim();
  // 看着像内置图标名、但图标库里没有 → 多半是拼错了，提前提醒
  const unknownBuiltin =
    v !== "" &&
    /^[a-z][a-z0-9-]*$/i.test(v) &&
    !CATEGORY_ICON_MAP[v] &&
    !isIconFont(v, hints);

  return (
    <div className="field">
      <label className="label" htmlFor={`${name}-icon`}>
        图标
      </label>
      <div className="row" style={{ gap: 8 }}>
        <input
          id={`${name}-icon`}
          name={name}
          className="input"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="图标名（如 globe）或图片地址 / Emoji"
        />
        <span className="icon-preview">
          <CategoryIcon icon={icon} name="预览" size={18} />
        </span>
      </div>

      <div className="icon-picker">
        {CATEGORY_ICONS.map((ic) => (
          <button
            key={ic.value}
            type="button"
            className={`icon-opt${icon === ic.value ? " active" : ""}`}
            title={ic.label}
            onClick={() => setIcon(ic.value)}
          >
            <CategoryIcon icon={ic.value} name={ic.label} size={17} />
          </button>
        ))}
      </div>

      {glyphs.length > 0 ? (
        <>
          <div className="label" style={{ marginTop: 12 }}>
            图标字体（{glyphs.length}）
          </div>
          <div className="icon-picker">
            {glyphs.map((g) => (
              <button
                key={g}
                type="button"
                className={`icon-opt${icon === g ? " active" : ""}`}
                title={g}
                onClick={() => setIcon(g)}
              >
                <CategoryIcon icon={g} name={g} size={17} />
              </button>
            ))}
          </div>
        </>
      ) : null}

      {unknownBuiltin ? (
        <div className="hint" style={{ color: "var(--orange)" }}>
          图标库没有「{v}」这个内置图标，前台会把它当普通文字显示。
          请从上面的宫格里选一个，或改填图片地址 / Emoji。
        </div>
      ) : null}

      <div className="hint">
        点图标宫格快速选择；也可以填图片地址或 Emoji。留空则显示分类名首字母。
        {v && isIconFont(v, hints) ? (
          <>
            {" "}
            当前识别为 iconfont 类名
            {isImageIcon(v) ? "（但它同时被当成图片地址）" : ""}。
          </>
        ) : null}
      </div>
      <div className="hint">
        想用 iconfont？先在「站点设置 → 外观与卡片 → 图标字体 CSS」填样式表地址，
        保存后回到这里就会多出一排图标字体宫格，直接点选即可。
        也可以手动填类名，如 <code>iconfont:io-wangzhan</code>。
      </div>
    </div>
  );
}
