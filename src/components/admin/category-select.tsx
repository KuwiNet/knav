"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CategoryIcon from "@/components/category-icon";

export interface CategoryOption {
  id: number;
  name: string;
  slug: string;
  parent: number;
  icon?: string;
  count?: number;
}

export interface CategorySelectProps {
  /** 提交到表单的字段名 */
  name: string;
  /** 初始选中值（分类 id） */
  value?: number | string | null;
  categories: CategoryOption[];
  placeholder?: string;
  /** 允许不选（提交空值） */
  allowEmpty?: boolean;
  emptyLabel?: string;
  /** 需要排除的分类 id 及其子孙（如「上级分类」不能选自己和自己的下级） */
  excludeIds?: number[];
  required?: boolean;
  id?: string;
  onChange?: (id: number) => void;
}

/** 取某个分类及其全部子孙的 id */
export function descendantIds(
  categories: CategoryOption[],
  rootId: number
): number[] {
  const out = new Set<number>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parent && out.has(c.parent) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return [...out];
}

/**
 * 分类选择器。
 *
 * 二级分类不与顶级分类平级展示：一律挂在所属顶级分类下面，
 * 有子分类的顶级分类右侧带一个箭头，点箭头才展开子分类。
 *
 * 面板用 portal + fixed 定位挂到 body 上：
 * 后台表格容器是 overflow-x:auto，绝对定位的下拉会被裁掉。
 */
export default function CategorySelect({
  name,
  value,
  categories,
  placeholder = "请选择分类",
  allowEmpty = true,
  emptyLabel = "不指定分类",
  excludeIds = [],
  required = false,
  id,
  onChange,
}: CategorySelectProps) {
  const initial = Number(value ?? 0) || 0;
  const [selectedId, setSelectedId] = useState<number>(initial);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // 受控：父组件改了 value 就同步选中项
  useEffect(() => {
    setSelectedId(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const excludeKey = excludeIds.join(",");
  const excluded = useMemo(
    () => new Set(excludeIds.map(Number)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [excludeKey]
  );

  const tops = useMemo(
    () => categories.filter((c) => c.parent === 0 && !excluded.has(c.id)),
    [categories, excluded]
  );

  const childrenOf = useMemo(() => {
    const m = new Map<number, CategoryOption[]>();
    for (const c of categories) {
      if (!c.parent || excluded.has(c.id)) continue;
      const list = m.get(c.parent) ?? [];
      list.push(c);
      m.set(c.parent, list);
    }
    return m;
  }, [categories, excluded]);

  const byId = useMemo(() => {
    const m = new Map<number, CategoryOption>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedParent = selected && selected.parent ? byId.get(selected.parent) : null;

  const label = selected
    ? selectedParent
      ? `${selectedParent.name} / ${selected.name}`
      : selected.name
    : placeholder;

  // 打开时定位面板
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  // 点外部 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
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

  // 选中的若是二级分类，打开时自动展开它的上级，省得用户自己找
  useEffect(() => {
    if (!open || !selected) return;
    if (selected.parent && !expanded.includes(selected.parent)) {
      setExpanded((list) => [...list, selected.parent]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedId]);

  const pick = (cid: number) => {
    setSelectedId(cid);
    setOpen(false);
    onChange?.(cid);
  };

  const toggle = (cid: number) =>
    setExpanded((list) =>
      list.includes(cid) ? list.filter((x) => x !== cid) : [...list, cid]
    );

  const panel = mounted && open && rect ? (
    <div
      ref={panelRef}
      className="cat-select-panel"
      style={{ top: rect.top, left: rect.left, minWidth: Math.max(rect.width, 220) }}
    >
      {allowEmpty ? (
        <button
          type="button"
          className={`cat-select-item${selectedId === 0 ? " is-active" : ""}`}
          onClick={() => pick(0)}
        >
          <span className="cat-select-name">{emptyLabel}</span>
        </button>
      ) : null}

      {tops.map((top) => {
        const kids = childrenOf.get(top.id) ?? [];
        const isOpen = expanded.includes(top.id);
        return (
          <div key={top.id} className="cat-select-group">
            <div className="cat-select-row">
              {kids.length > 0 ? (
                <button
                  type="button"
                  className="cat-select-caret"
                  aria-expanded={isOpen}
                  title={isOpen ? "收起子分类" : `展开「${top.name}」的 ${kids.length} 个子分类`}
                  onClick={() => toggle(top.id)}
                >
                  {isOpen ? "▾" : "▸"}
                </button>
              ) : (
                <span className="cat-select-caret cat-select-caret-blank" />
              )}
              <button
                type="button"
                className={`cat-select-item${selectedId === top.id ? " is-active" : ""}`}
                onClick={() => pick(top.id)}
              >
                <CategoryIcon icon={top.icon} name={top.name} size={15} />
                <span className="cat-select-name">{top.name}</span>
                {typeof top.count === "number" ? (
                  <span className="cat-select-count">{top.count}</span>
                ) : null}
              </button>
            </div>

            {kids.length > 0 && isOpen ? (
              kids.map((k) => (
                <div key={k.id} className="cat-select-row cat-select-row-child">
                  <span className="cat-select-caret cat-select-caret-blank" />
                  <button
                    type="button"
                    className={`cat-select-item${selectedId === k.id ? " is-active" : ""}`}
                    onClick={() => pick(k.id)}
                  >
                    <CategoryIcon icon={k.icon} name={k.name} size={14} />
                    <span className="cat-select-name">{k.name}</span>
                    {typeof k.count === "number" ? (
                      <span className="cat-select-count">{k.count}</span>
                    ) : null}
                  </button>
                </div>
              ))
            ) : null}
          </div>
        );
      })}

      {tops.length === 0 ? (
        <div className="cat-select-empty">没有可选的分类</div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="cat-select">
      <input type="hidden" name={name} value={selectedId} />
      <button
        type="button"
        ref={triggerRef}
        id={id}
        className={`input cat-select-trigger${selectedId ? "" : " is-placeholder"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required || undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="cat-select-label">{label}</span>
        <span className="cat-select-arrow" aria-hidden="true">
          ▾
        </span>
      </button>

      {mounted && open
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
}

/**
 * 多选分类。
 *
 * 和单选共用同一套面板与树形展开，区别是点击只切换选中状态、不关闭面板，
 * 表单里为每个选中分类提交一个同名隐藏字段（categoryIds）。
 */
export function CategoryMultiSelect({
  name,
  values,
  categories,
  placeholder = "（选择分类）",
  allowEmpty = true,
  emptyLabel = "清空选择",
  id,
  onChange,
}: {
  name: string;
  values: number[];
  categories: CategoryOption[];
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  id?: string;
  onChange?: (ids: number[]) => void;
}) {
  const [picked, setPicked] = useState<number[]>(values);
  const valuesKey = values.join(",");
  useEffect(() => {
    setPicked(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey]);

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const tops = useMemo(() => categories.filter((c) => c.parent === 0), [categories]);

  const childrenOf = useMemo(() => {
    const m = new Map<number, CategoryOption[]>();
    for (const c of categories) {
      if (!c.parent) continue;
      const list = m.get(c.parent) ?? [];
      list.push(c);
      m.set(c.parent, list);
    }
    return m;
  }, [categories]);

  const byId = useMemo(() => {
    const m = new Map<number, CategoryOption>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const labels = picked
    .map((cid) => {
      const c = byId.get(cid);
      if (!c) return "";
      const parent = c.parent ? byId.get(c.parent) : null;
      return parent ? `${parent.name} / ${c.name}` : c.name;
    })
    .filter(Boolean);

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
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

  // 打开时展开已选分类所在的上级
  useEffect(() => {
    if (!open) return;
    setExpanded((list) => {
      const next = new Set(list);
      for (const cid of picked) {
        const c = byId.get(cid);
        if (c?.parent) next.add(c.parent);
      }
      return [...next];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const togglePick = (cid: number) => {
    const next = picked.includes(cid)
      ? picked.filter((x) => x !== cid)
      : [...picked, cid];
    setPicked(next);
    onChange?.(next);
  };

  const toggleExpand = (cid: number) =>
    setExpanded((list) =>
      list.includes(cid) ? list.filter((x) => x !== cid) : [...list, cid]
    );

  const panel = mounted && open && rect ? (
    <div
      ref={panelRef}
      className="cat-select-panel"
      style={{ top: rect.top, left: rect.left, minWidth: Math.max(rect.width, 240) }}
    >
      <div className="cat-select-multi-head">
        <span>可多选，已选 {picked.length} 个</span>
        {allowEmpty && picked.length > 0 ? (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setPicked([]);
              onChange?.([]);
            }}
          >
            {emptyLabel}
          </button>
        ) : null}
      </div>

      {tops.map((top) => {
        const kids = childrenOf.get(top.id) ?? [];
        const isOpen = expanded.includes(top.id);
        return (
          <div key={top.id} className="cat-select-group">
            <div className="cat-select-row">
              {kids.length > 0 ? (
                <button
                  type="button"
                  className="cat-select-caret"
                  aria-expanded={isOpen}
                  title={isOpen ? "收起子分类" : `展开「${top.name}」的 ${kids.length} 个子分类`}
                  onClick={() => toggleExpand(top.id)}
                >
                  {isOpen ? "▾" : "▸"}
                </button>
              ) : (
                <span className="cat-select-caret cat-select-caret-blank" />
              )}
              <button
                type="button"
                className={`cat-select-item${picked.includes(top.id) ? " is-active" : ""}`}
                onClick={() => togglePick(top.id)}
              >
                <span className="cat-select-check" aria-hidden="true">
                  {picked.includes(top.id) ? "✓" : ""}
                </span>
                <CategoryIcon icon={top.icon} name={top.name} size={15} />
                <span className="cat-select-name">{top.name}</span>
                {typeof top.count === "number" ? (
                  <span className="cat-select-count">{top.count}</span>
                ) : null}
              </button>
            </div>

            {kids.length > 0 && isOpen ? (
              kids.map((k) => (
                <div key={k.id} className="cat-select-row cat-select-row-child">
                  <span className="cat-select-caret cat-select-caret-blank" />
                  <button
                    type="button"
                    className={`cat-select-item${picked.includes(k.id) ? " is-active" : ""}`}
                    onClick={() => togglePick(k.id)}
                  >
                    <span className="cat-select-check" aria-hidden="true">
                      {picked.includes(k.id) ? "✓" : ""}
                    </span>
                    <CategoryIcon icon={k.icon} name={k.name} size={14} />
                    <span className="cat-select-name">{k.name}</span>
                    {typeof k.count === "number" ? (
                      <span className="cat-select-count">{k.count}</span>
                    ) : null}
                  </button>
                </div>
              ))
            ) : null}
          </div>
        );
      })}

      {tops.length === 0 ? (
        <div className="cat-select-empty">没有可选的分类</div>
      ) : null}

      <div className="cat-select-multi-foot">
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          完成
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="cat-select">
      {picked.map((cid) => (
        <input key={cid} type="hidden" name={name} value={cid} />
      ))}
      <button
        type="button"
        ref={triggerRef}
        id={id}
        className={`input cat-select-trigger${picked.length ? "" : " is-placeholder"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="选择分类（可多选）"
        title={labels.join("、")}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="cat-select-label">
          {labels.length ? labels.join("、") : placeholder}
        </span>
        {picked.length > 1 ? (
          <span className="cat-select-count">{picked.length}</span>
        ) : null}
        <span className="cat-select-arrow" aria-hidden="true">
          ▾
        </span>
      </button>

      {mounted && open ? createPortal(panel, document.body) : null}
    </div>
  );
}
