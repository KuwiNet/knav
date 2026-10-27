"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 预设 + 自由输入。
 *
 * 输入框右侧的箭头展开常用选项；选中后填入输入框，也可以直接输入任意值。
 * 面板用 portal + fixed 定位，避免被后台卡片的 overflow 裁掉。
 */
export default function PresetInput({
  name,
  presets,
  defaultValue = "",
  placeholder,
  required = false,
  id,
  listLabel = "常用选项",
}: {
  name: string;
  presets: readonly string[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
  /** 面板标题，如「常用平台」「常用镜像」 */
  listLabel?: string;
}) {
  const [text, setText] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setText(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      // 下方放不下就翻到输入框上方，避免面板被视口底部裁掉
      const flip = below < 200 && above > below;
      setRect({
        left: r.left,
        width: r.width,
        top: flip ? undefined : r.bottom + 4,
        bottom: flip ? window.innerHeight - r.top + 4 : undefined,
        maxHeight: Math.max(120, Math.min(320, flip ? above : below)),
      });
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (value: string) => {
    setText(value);
    setOpen(false);
  };

  return (
    <div className="preset-input" ref={wrapRef}>
      <input
        ref={inputRef}
        id={id}
        className="input"
        name={name}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      <button
        type="button"
        className="preset-input-toggle"
        aria-label={`${listLabel}（也可直接输入）`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ▾
      </button>

      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              className="cat-select-panel preset-input-panel"
              style={{
                top: rect?.bottom != null ? undefined : rect?.top ?? 0,
                bottom: rect?.bottom,
                left: rect?.left ?? 0,
                maxHeight: rect?.maxHeight,
                minWidth: Math.max(rect?.width ?? 160, 160),
              }}
            >
              <div className="preset-input-head">
                <span>{listLabel}</span>
                <span>也可直接输入</span>
              </div>
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`cat-select-item${p === text ? " is-active" : ""}`}
                  onClick={() => pick(p)}
                >
                  <span className="cat-select-name">{p}</span>
                  {p === text ? <span className="cat-select-count">✓</span> : null}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
