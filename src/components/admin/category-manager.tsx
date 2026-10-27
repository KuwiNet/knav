"use client";

import { Fragment, useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  moveCategoryAction,
  mergeCategoryAction,
} from "@/lib/actions/admin-actions";
import type { FormState } from "@/lib/actions/types";
import type { Category } from "@/lib/content";
import { pinyinInitials } from "@/lib/pinyin";
import CategoryIcon from "@/components/category-icon";
import IconPicker from "@/components/admin/icon-picker";
import CategorySelect, { descendantIds } from "@/components/admin/category-select";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-sm" disabled={pending}>
      {pending ? "保存中…" : label}
    </button>
  );
}

function Msg({ state }: { state: FormState }) {
  if (state.error)
    return (
      <div className="alert alert-error" style={{ marginTop: 10, marginBottom: 0 }}>
        {state.error}
      </div>
    );
  if (state.success)
    return (
      <div className="alert alert-success" style={{ marginTop: 10, marginBottom: 0 }}>
        {state.success}
      </div>
    );
  return null;
}

/** 新增 / 编辑表单（同一个组件，按 mode 切换） */
function CategoryForm({
  mode,
  cat,
  categories,
  onSaved,
}: {
  mode: "create" | "edit";
  cat?: Category;
  categories: Category[];
  /** 保存成功后回调（用来收起表单） */
  onSaved?: () => void;
}) {
  const action =
    mode === "create" ? createCategoryAction : updateCategoryAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  // 保存成功后自动收起表单
  useEffect(() => {
    if (state.success) onSaved?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  // 上级分类不能选自己和自己的下级，否则会形成环
  const excluded = useMemo(
    () => (cat ? descendantIds(categories, cat.id) : []),
    [categories, cat]
  );

  const [name, setName] = useState(cat?.name ?? "");
  const [slug, setSlug] = useState(cat?.slug ?? "");
  /** 别名是否跟着名称自动生成。编辑已有分类时不覆盖现成别名，除非用户把别名清空 */
  const [autoSlug, setAutoSlug] = useState(mode === "create");

  return (
    <form action={formAction} className="card card-pad">
      {mode === "edit" ? <input type="hidden" name="id" value={cat!.id} /> : null}
      <h3 className="aside-title" style={{ marginTop: 0 }}>
        {mode === "create" ? "新增分类" : `编辑分类：${cat!.name}`}
      </h3>
      <Msg state={state} />

      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label className="label">名称</label>
          <input
            className="input"
            name="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (autoSlug) setSlug(pinyinInitials(e.target.value));
            }}
            required
            placeholder="如：自建服务"
          />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label className="label">
            别名（URL）
            {autoSlug && slug ? (
              <span className="text-sm text-muted"> · 自动生成</span>
            ) : null}
          </label>
          <input
            className="input"
            // 自动生成时不提交这个字段：服务端才能分辨「用户手填」和「我们生成的」，
            // 生成值撞车时才有机会加序号而不是回一句「该别名已存在」
            name={autoSlug ? undefined : "slug"}
            value={slug}
            onChange={(e) => {
              const v = e.target.value;
              setSlug(v);
              // 清空别名就交还给自动生成，填了则以用户填的为准
              setAutoSlug(!v.trim());
            }}
            placeholder={autoSlug ? "自动按名称生成" : "zijianfuwu"}
            pattern="[a-z0-9-]+"
          />
          <div className="hint">
            留空自动取名称拼音首字母（如「常用推荐」→ cytj），重名时自动加序号。
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label className="label">上级分类</label>
          <CategorySelect
            name="parent"
            value={cat?.parent ?? 0}
            categories={categories}
            excludeIds={excluded}
            emptyLabel="顶级分类"
            placeholder="顶级分类"
          />
        </div>
        <div style={{ flex: 0, minWidth: 110 }}>
          <label className="label">排序</label>
          <input
            className="input"
            name="order"
            type="number"
            defaultValue={cat?.order ?? 0}
          />
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label className="label">描述</label>
        <input
          className="input"
          name="description"
          defaultValue={cat?.description ?? ""}
          placeholder="一句话说明这个分类收录什么"
        />
      </div>

      <IconPicker name="icon" value={cat?.icon ?? ""} />

      <div className="field">
        <label className="label">封面图</label>
        <input
          className="input"
          name="cover"
          defaultValue={cat?.cover ?? ""}
          placeholder="图片地址（远程地址保存时自动下载到本地）"
        />
        <div className="hint">用于分类页头部横幅，留空则不显示。</div>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 6 }}>
        <SaveButton label={mode === "create" ? "创建分类" : "保存修改"} />
      </div>
    </form>
  );
}

/** 合并分类表单 */
function MergeForm({ categories }: { categories: Category[] }) {
  const [state, action] = useActionState<FormState, FormData>(
    mergeCategoryAction,
    {}
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => setOpen(true)}
      >
        合并分类…
      </button>
    );
  }

  return (
    <form action={action} className="card card-pad">
      <h3 className="aside-title" style={{ marginTop: 0 }}>
        合并分类
      </h3>
      <Msg state={state} />
      <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label className="label">要合并的分类（将被删除）</label>
          <CategorySelect
            name="fromId"
            value={0}
            categories={categories}
            emptyLabel="选择分类"
            placeholder="选择分类"
          />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label className="label">合并到</label>
          <CategorySelect
            name="toId"
            value={0}
            categories={categories}
            emptyLabel="选择分类"
            placeholder="选择分类"
          />
        </div>
        <SaveButton label="合并" />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(false)}
        >
          取消
        </button>
      </div>
      <div className="hint" style={{ marginTop: 8 }}>
        合并后，原分类下的内容会全部转到目标分类，原分类被删除。
      </div>
    </form>
  );
}

export default function CategoryManager({
  categories,
}: {
  categories: Category[];
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  /** 哪些顶级分类的二级分类被展开（默认全收起，点箭头才展开） */
  const [expanded, setExpanded] = useState<number[]>([]);

  const byId = useMemo(
    () => new Map(categories.map((c) => [c.id, c] as const)),
    [categories]
  );

  // 二级分类挂在所属顶级分类下面；上级已经不存在的单独铺开，免得分类从列表里消失却删不掉
  const { tops, childrenOf, orphans } = useMemo(() => {
    const kids = new Map<number, Category[]>();
    const topList: Category[] = [];
    const orphanList: Category[] = [];
    for (const c of categories) {
      if (!c.parent) {
        topList.push(c);
        continue;
      }
      if (!byId.has(c.parent)) {
        orphanList.push(c);
        continue;
      }
      const list = kids.get(c.parent) ?? [];
      list.push(c);
      kids.set(c.parent, list);
    }
    for (const list of kids.values()) {
      list.sort((a, b) => a.order - b.order || a.id - b.id);
    }
    return { tops: topList, childrenOf: kids, orphans: orphanList };
  }, [categories, byId]);

  // 编辑的是二级分类时先把它的上级展开，否则表单在收起的分组里看不见
  useEffect(() => {
    if (editing == null) return;
    const parent = byId.get(editing)?.parent ?? 0;
    if (parent && !expanded.includes(parent)) {
      setExpanded((list) => [...list, parent]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, byId]);

  const toggle = (id: number) =>
    setExpanded((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
    );

  const groupable = tops.filter((c) => (childrenOf.get(c.id) ?? []).length > 0);
  const allOpen =
    groupable.length > 0 && groupable.every((c) => expanded.includes(c.id));

  /** 一行分类 + 它正下方就地展开的编辑表单 */
  const renderRow = (c: Category, isChild: boolean) => {
    const kids = childrenOf.get(c.id) ?? [];
    const isOpen = expanded.includes(c.id);
    return (
      <Fragment key={c.id}>
        <tr className={isChild ? "cat-row-child" : undefined}>
          <td>
            <span className="cat-icon-cell">
              <CategoryIcon icon={c.icon} name={c.name} size={17} />
            </span>
          </td>
          <td>
            <div className="cat-row-name">
              {isChild ? (
                <span className="cat-caret cat-caret-blank" aria-hidden="true" />
              ) : kids.length > 0 ? (
                <button
                  type="button"
                  className={`cat-caret${isOpen ? " is-open" : ""}`}
                  aria-expanded={isOpen}
                  title={
                    isOpen
                      ? `收起「${c.name}」的二级分类`
                      : `展开「${c.name}」的 ${kids.length} 个二级分类`
                  }
                  onClick={() => toggle(c.id)}
                >
                  {isOpen ? "▾" : "▸"}
                </button>
              ) : (
                <span className="cat-caret cat-caret-blank" aria-hidden="true" />
              )}
              <div>
                <div className="strong">
                  {c.name}
                  {!isChild && kids.length > 0 ? (
                    <span className="text-sm text-muted"> · {kids.length} 个二级</span>
                  ) : null}
                </div>
                <div className="text-sm text-muted mono">/{c.slug}</div>
              </div>
            </div>
          </td>
          <td className="text-sm mono">{c.order}</td>
          <td className="text-sm">
            网址 {c.siteCount} · 文章 {c.articleCount} · 应用 {c.appCount}
          </td>
          <td>
            <div className="row" style={{ gap: 6 }}>
              <form action={moveCategoryAction} style={{ display: "inline" }}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="dir" value="up" />
                <button
                  type="submit"
                  className="btn btn-sm btn-outline"
                  title="在同一上级内上移"
                  onClick={() => setEditing(null)}
                >
                  ↑
                </button>
              </form>
              <form action={moveCategoryAction} style={{ display: "inline" }}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="dir" value="down" />
                <button
                  type="submit"
                  className="btn btn-sm btn-outline"
                  title="在同一上级内下移"
                  onClick={() => setEditing(null)}
                >
                  ↓
                </button>
              </form>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  setEditing(editing === c.id ? null : c.id);
                  setShowCreate(false);
                }}
              >
                {editing === c.id ? "取消" : "编辑"}
              </button>
              <form action={deleteCategoryAction} style={{ display: "inline" }}>
                <input type="hidden" name="id" value={c.id} />
                <button
                  type="submit"
                  className="btn btn-sm btn-outline"
                  style={{ color: "var(--red)", borderColor: "var(--red)" }}
                  onClick={(e) => {
                    if (
                      !confirm(
                        `确定删除分类「${c.name}」？分类下的内容会保留，但不再归属该分类。`
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                >
                  删除
                </button>
              </form>
            </div>
          </td>
        </tr>

        {/* 编辑表单就地展开在该分类行的正下方 */}
        {editing === c.id ? (
          <tr>
            <td
              colSpan={5}
              style={{ background: "var(--surface-2)", padding: 10 }}
            >
              <CategoryForm
                /* key 必须跟着分类走：表单里的输入框部分不受控，
                   不换 key 的话，保存完分类 A 再点分类 B，表单还是 A 的内容 */
                key={`edit-${editing}`}
                mode="edit"
                cat={c}
                categories={categories}
                onSaved={() => setEditing(null)}
              />
            </td>
          </tr>
        ) : null}
      </Fragment>
    );
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 10 }}>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setShowCreate((v) => !v);
            setEditing(null);
          }}
        >
          {showCreate ? "收起" : "新增分类"}
        </button>
        {groupable.length > 0 ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() =>
              setExpanded(allOpen ? [] : groupable.map((c) => c.id))
            }
          >
            {allOpen ? "收起全部二级分类" : "展开全部二级分类"}
          </button>
        ) : null}
        <MergeForm categories={categories} />
        <span className="text-muted text-sm spacer" style={{ textAlign: "right" }}>
          共 {categories.length} 个分类
        </span>
      </div>

      {showCreate ? (
        <CategoryForm key="create" mode="create" categories={categories} />
      ) : null}

      {/* 编辑表单不在这里：一律就地展开在被编辑分类那一行的正下方，
          这样改哪个分类就在哪个分类下面改，不用滚回页面顶部。 */}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 54 }}>图标</th>
              <th>分类</th>
              <th style={{ width: 76 }}>排序</th>
              <th style={{ width: 150 }}>内容数</th>
              <th style={{ width: 230 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {tops.map((c) => (
              <Fragment key={c.id}>
                {renderRow(c, false)}
                {expanded.includes(c.id)
                  ? (childrenOf.get(c.id) ?? []).map((k) => renderRow(k, true))
                  : null}
              </Fragment>
            ))}
            {orphans.map((c) => renderRow(c, false))}
          </tbody>
        </table>
        {tops.length === 0 && orphans.length === 0 ? (
          <div className="empty">还没有分类，点上面「新增分类」建一个，或到「数据迁移」导入老站数据。</div>
        ) : null}
      </div>
    </div>
  );
}
