"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Category } from "@/lib/content";
import CategoryIcon from "./category-icon";

/**
 * 顶栏「全部分类」面板。
 *
 * 顶栏横向空间有限，分类一多就显示不全（只能横向滚动，滚动条还被藏了，
 * 用户根本不知道右边还有）。这里补一个面板：所有顶级分类一次性铺开，
 * 二级分类默认收起，各自右侧一个小箭头，点箭头才展开，免得面板一打开就糊满屏。
 *
 * 面板用 portal 挂到 body 上：
 * 顶栏有 backdrop-filter，会成为 fixed 定位的包含块，
 * 面板留在顶栏里既会被裁掉、又定位不准。
 */
export default function CategoryMenu({
  categories,
  allHref = "/category",
}: {
  categories: Category[];
  allHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelTop, setPanelTop] = useState(56);
  /** 哪些顶级分类的二级分类被展开了（默认全收起，点右侧箭头才展开） */
  const [expanded, setExpanded] = useState<number[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleExpanded = (id: number) =>
    setExpanded((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
    );

  const tops = categories.filter((c) => c.parent === 0);
  const childrenOf = new Map<number, Category[]>();
  for (const c of categories) {
    if (!c.parent) continue;
    const list = childrenOf.get(c.parent) ?? [];
    list.push(c);
    childrenOf.set(c.parent, list);
  }

  useEffect(() => setMounted(true), []);

  // 面板贴在顶栏下沿，顶栏高度是随断点变的，量一下最稳
  useEffect(() => {
    if (!open) return;
    const rect = document
      .querySelector(".site-header")
      ?.getBoundingClientRect();
    if (rect) setPanelTop(Math.round(rect.bottom));
  }, [open]);

  // 点外部或按 Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if ((t as HTMLElement)?.closest?.(".cat-menu-panel")) return;
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

  // 鼠标从按钮移到面板要跨一段距离，延迟关闭，避免中途收起
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const panel = (
    <div
      className="cat-menu-panel"
      style={{ top: panelTop }}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <div className="cat-menu-panel-inner">
        <div className="cat-menu-grid">
          {tops.map((c) => {
            const kids = childrenOf.get(c.id) ?? [];
            const isOpen = expanded.includes(c.id);
            return (
              <div className="cat-menu-col" key={c.id}>
                <div className="cat-menu-parent-row">
                  <Link
                    href={`/category/${c.slug}`}
                    className="cat-menu-item cat-menu-parent"
                    onClick={() => setOpen(false)}
                  >
                    <CategoryIcon icon={c.icon} name={c.name} size={16} />
                    <span className="cat-menu-name">{c.name}</span>
                    <span className="cat-menu-count">{c.count}</span>
                  </Link>
                  {/* 二级分类默认收起，点这个箭头才展开；没有子分类就不显示箭头 */}
                  {kids.length > 0 ? (
                    <button
                      type="button"
                      className={`cat-menu-toggle ${isOpen ? "is-open" : ""}`}
                      aria-expanded={isOpen}
                      title={
                        isOpen
                          ? `收起「${c.name}」的二级分类`
                          : `展开「${c.name}」的 ${kids.length} 个二级分类`
                      }
                      onClick={() => toggleExpanded(c.id)}
                    >
                      <span className="cat-menu-toggle-caret" aria-hidden="true">
                        {isOpen ? "▾" : "▸"}
                      </span>
                      <span className="cat-menu-toggle-count">{kids.length}</span>
                    </button>
                  ) : null}
                </div>
                {kids.length > 0 && isOpen ? (
                  <div className="cat-menu-kids">
                    {kids.map((k) => (
                      <Link
                        key={k.id}
                        href={`/category/${k.slug}`}
                        className="cat-menu-item cat-menu-child"
                        onClick={() => setOpen(false)}
                      >
                        <span className="cat-menu-name">{k.name}</span>
                        <span className="cat-menu-count">{k.count}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="cat-menu-foot">
          <Link href={allHref} onClick={() => setOpen(false)}>
            查看全部分类 →
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="cat-menu"
      ref={wrapRef}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className={`nav-link cat-menu-btn ${open ? "is-open" : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <span>全部分类</span>
        <span className="cat-menu-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {mounted && open
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
}
