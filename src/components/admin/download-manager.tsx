"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createPlatformAction,
  updatePlatformAction,
  deletePlatformAction,
  bulkPlatformAction,
  setSoftwareTitleAction,
  createSoftwareAction,
  createMirrorAction,
  updateMirrorAction,
  deleteMirrorAction,
} from "@/lib/actions/admin-actions";
import type { FormState } from "@/lib/actions/types";
import type {
  AdminSoftwareRow,
  AdminPlatformRow,
  AdminMirrorRow,
} from "@/lib/admin";
import { PLATFORM_PRESETS, MIRROR_PRESETS, ARCH_PRESETS } from "@/lib/admin-types";
import CategorySelect, { type CategoryOption } from "@/components/admin/category-select";

export interface AppOption {
  id: number;
  title: string;
}

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

/* ------------------------------------------------------------ 平台版本表单 */

/**
 * 平台版本表单。
 *
 * 一律在所属软件的卡片内部就地展开（新增在表格上方、编辑在该行下方），
 * 不再跑到页面顶部——用户点哪个软件就在哪个软件里改。
 * 因此所属软件是隐含的（contentId 由卡片带进来），不再给下拉选择。
 */
function PlatformForm({
  mode,
  item,
  contentId,
  softwareTitle,
  defaultPlatform,
  defaultArch,
  defaultResourceTitle,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  item?: AdminPlatformRow;
  /** 所属软件，由卡片传入 */
  contentId: number;
  softwareTitle: string;
  defaultPlatform?: string;
  defaultArch?: string;
  /** 该软件当前的自定义显示名，新增平台版本时沿用，避免同一软件出现两个名字 */
  defaultResourceTitle?: string;
  onCancel: () => void;
  /** 保存成功后回调（用来收起表单） */
  onSaved?: () => void;
}) {
  const action = mode === "create" ? createPlatformAction : updatePlatformAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const primary = item?.mirrors?.[0];
  const resolvedPostId = item?.contentId ?? contentId;

  useEffect(() => {
    if (state.success) onSaved?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form
      action={formAction}
      className="card card-pad"
      style={{ background: "var(--surface-2)", margin: 0 }}
    >
      <input type="hidden" name="contentId" value={resolvedPostId} />
      {mode === "edit" && item ? <input type="hidden" name="id" value={item.id} /> : null}
      <h4 className="aside-title" style={{ marginTop: 0, fontSize: 14 }}>
        {mode === "create" ? "添加平台版本" : "编辑平台版本"}
        <span className="text-muted" style={{ fontWeight: 400, marginLeft: 6 }}>
          {softwareTitle}
          {mode === "edit" && item ? ` · ${item.platform} ${item.version}`.trim() : ""}
        </span>
      </h4>
      <Msg state={state} />

      <div className="row" style={{ gap: 10, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 130 }}>
          <label className="label">平台</label>
          <input
            className="input"
            name="platform"
            list="kw-dl-platforms"
            defaultValue={item?.platform ?? defaultPlatform ?? ""}
            placeholder="Windows"
          />
          <datalist id="kw-dl-platforms">
            {PLATFORM_PRESETS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label className="label">架构</label>
          <input
            className="input"
            name="arch"
            list="kw-dl-archs"
            defaultValue={item?.arch ?? defaultArch ?? ""}
            placeholder="x64 / ARM64，留空不限"
          />
          <datalist id="kw-dl-archs">
            {ARCH_PRESETS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label className="label">版本</label>
          <input
            className="input"
            name="version"
            defaultValue={item?.version ?? ""}
            placeholder="1.2.0"
          />
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <label className="label">文件大小</label>
          <input
            className="input"
            name="fileSize"
            defaultValue={item?.fileSize ?? ""}
            placeholder="5.2 GB"
          />
        </div>
        <div style={{ flex: 0, minWidth: 80 }}>
          <label className="label">排序</label>
          <input className="input" name="sort" type="number" defaultValue={item?.sort ?? 0} />
        </div>
      </div>

      {mode === "create" ? (
        <>
          <div className="hint" style={{ marginTop: 10 }}>
            下面这条会成为该平台的「主下载链接」，保存后可以继续给它加网盘、应用商店等镜像。
          </div>
          <div className="row" style={{ gap: 10, alignItems: "flex-end", marginTop: 6, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label className="label">镜像名称</label>
              <input
                className="input"
                name="mirrorName"
                list="kw-dl-mirrors"
                defaultValue="官方下载"
              />
            </div>
            <div style={{ flex: 3, minWidth: 220 }}>
              <label className="label">下载地址</label>
              <input className="input" name="url" placeholder="https://..." />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label className="label">备注（如提取码）</label>
              <input className="input" name="mirrorNote" placeholder="提取码 ab12" />
            </div>
          </div>
          <datalist id="kw-dl-mirrors">
            {MIRROR_PRESETS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </>
      ) : primary ? (
        <div className="hint" style={{ marginTop: 10 }}>
          主下载链接「{primary.name}」在下方镜像列表里维护，这里只改平台 / 架构 / 版本等信息。
        </div>
      ) : null}

      <details className="field" style={{ marginTop: 10 }}>
        <summary className="label" style={{ cursor: "pointer" }}>
          更多设置（软件显示名 / 校验值 / 预览图 / 版本说明）
        </summary>
        <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 180 }}>
            <label className="label">软件显示名（留空用内容标题）</label>
            <input
              className="input"
              name="resourceTitle"
              defaultValue={item?.resourceTitle ?? defaultResourceTitle ?? ""}
              placeholder="留空则用软件标题"
            />
          </div>
          <div style={{ flex: 2, minWidth: 180 }}>
            <label className="label">SHA256</label>
            <input className="input textarea-mono" name="sha256" defaultValue={item?.sha256 ?? ""} />
          </div>
        </div>
        <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 180 }}>
            <label className="label">预览图地址</label>
            <input
              className="input"
              name="preview"
              defaultValue={item?.preview ?? ""}
              placeholder="远程地址保存时自动本地化"
            />
          </div>
          <div style={{ flex: 2, minWidth: 180 }}>
            <label className="label">版本说明</label>
            <input className="input" name="note" defaultValue={item?.note ?? ""} />
          </div>
        </div>
      </details>

      <label className="switch-row" style={{ marginTop: 10 }}>
        <input type="hidden" name="enabled" value="0" />
        <input
          type="checkbox"
          name="enabled"
          value="1"
          defaultChecked={mode === "create" ? true : item!.enabled === 1}
        />
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        <span className="switch-text">
          <span className="switch-label">前台显示该平台</span>
          <span className="hint">关闭后前台不显示，记录与镜像链接都保留</span>
        </span>
      </label>

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <SaveButton label={mode === "create" ? "添加平台版本" : "保存修改"} />
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- 软件表单 */

/**
 * 新增软件。
 *
 * 软件名称直接填，不是从已有内容里选下拉——否则永远只能给老内容挂下载。
 * 需要给一条已有内容（比如一篇老文章）补下载时，展开「关联已有内容」再选。
 */
function SoftwareForm({
  apps,
  categories,
  onCancel,
  onSaved,
}: {
  apps: AppOption[];
  categories: CategoryOption[];
  onCancel: () => void;
  /** 保存成功后回调（用来收起表单） */
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(createSoftwareAction, {});
  const [linkExisting, setLinkExisting] = useState(false);

  useEffect(() => {
    if (state.success) onSaved?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="card card-pad">
      <h3 className="aside-title" style={{ marginTop: 0 }}>
        新增软件
      </h3>
      <div className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
        软件是下载数据的根：先建软件，再在它的卡片里加平台版本（Windows x64 / macOS Apple
        Silicon / Android ARM64…），每个平台下还能加官方下载、百度网盘、App Store 等多个镜像。
      </div>
      <Msg state={state} />

      <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label className="label">软件名称</label>
          <input
            className="input"
            name="name"
            required={!linkExisting}
            placeholder="如 FinalShell"
          />
        </div>
        <div style={{ flex: 2, minWidth: 180 }}>
          <label className="label">分类</label>
          <CategorySelect
            name="categoryId"
            value={0}
            categories={categories}
            emptyLabel="（不分类）"
            placeholder="（不分类）"
          />
        </div>
        <div style={{ flex: 3, minWidth: 220 }}>
          <label className="label">软件主页</label>
          <input className="input" name="url" placeholder="https://..." />
        </div>
      </div>

      <div className="row" style={{ gap: 10, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label className="label">图标地址</label>
          <input className="input" name="icon" placeholder="远程地址保存时自动本地化" />
        </div>
        <div style={{ flex: 4, minWidth: 240 }}>
          <label className="label">简介</label>
          <input className="input" name="description" placeholder="一句话介绍" />
        </div>
      </div>

      <details className="field" style={{ marginTop: 10 }}>
        <summary
          className="label"
          style={{ cursor: "pointer" }}
          onClick={() => setLinkExisting((v) => !v)}
        >
          首个平台版本（可留空，建好软件后再加）
        </summary>
        <div className="row" style={{ gap: 10, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label className="label">平台</label>
            <input className="input" name="platform" list="kw-sw-platforms" placeholder="Windows" />
            <datalist id="kw-sw-platforms">
              {PLATFORM_PRESETS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div style={{ flex: 1, minWidth: 110 }}>
            <label className="label">架构</label>
            <input className="input" name="arch" list="kw-sw-archs" placeholder="x64" />
            <datalist id="kw-sw-archs">
              {ARCH_PRESETS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label className="label">版本</label>
            <input className="input" name="version" placeholder="1.0.0" />
          </div>
          <div style={{ flex: 1, minWidth: 90 }}>
            <label className="label">大小</label>
            <input className="input" name="fileSize" placeholder="12.3 MB" />
          </div>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label className="label">镜像名称</label>
            <input className="input" name="mirrorName" list="kw-sw-mirrors" defaultValue="官方下载" />
            <datalist id="kw-sw-mirrors">
              {MIRROR_PRESETS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div style={{ flex: 3, minWidth: 220 }}>
            <label className="label">下载地址</label>
            <input className="input" name="mirrorUrl" placeholder="https://..." />
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label className="label">备注（如提取码）</label>
            <input className="input" name="mirrorNote" placeholder="提取码 ab12" />
          </div>
        </div>
      </details>

      <details className="field" style={{ marginTop: 10 }} open={linkExisting}>
        <summary className="label" style={{ cursor: "pointer" }}>
          关联已有内容（给老文章 / 老应用补下载时才用）
        </summary>
        <div className="hint" style={{ margin: "8px 0 6px" }}>
          选了下面任意一条，就不会新建软件，而是把平台版本挂到那条内容上。
        </div>
        <select
          className="input"
          name="linkContentId"
          defaultValue=""
          style={{ maxWidth: 420 }}
        >
          <option value="">（不关联，新建软件）</option>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              #{a.id} {a.title}
            </option>
          ))}
        </select>
      </details>

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <SaveButton label="创建软件" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- 镜像表单 */

function MirrorForm({
  mode,
  item,
  downloadId,
  platformLabel,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  item?: AdminMirrorRow;
  downloadId: number;
  platformLabel: string;
  onCancel: () => void;
  /** 保存成功后回调（用来收起表单） */
  onSaved?: () => void;
}) {
  const action = mode === "create" ? createMirrorAction : updateMirrorAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  useEffect(() => {
    if (state.success) onSaved?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="card card-pad" style={{ background: "var(--surface-2)" }}>
      <input type="hidden" name="downloadId" value={downloadId} />
      {mode === "edit" && item ? <input type="hidden" name="id" value={item.id} /> : null}
      <h4 className="aside-title" style={{ marginTop: 0, fontSize: 14 }}>
        {mode === "create" ? "添加镜像链接" : "编辑镜像链接"}
        <span className="text-muted" style={{ fontWeight: 400, marginLeft: 6 }}>
          {platformLabel}
        </span>
      </h4>
      <Msg state={state} />

      <div className="row" style={{ gap: 8, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 130 }}>
          <label className="label">镜像名称</label>
          <input
            className="input"
            name="name"
            list="kw-mirror-presets"
            required
            defaultValue={item?.name ?? "官方下载"}
            placeholder="官方下载 / 百度网盘"
          />
          <datalist id="kw-mirror-presets">
            {MIRROR_PRESETS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div style={{ flex: 3, minWidth: 220 }}>
          <label className="label">下载地址</label>
          <input
            className="input"
            name="url"
            required
            defaultValue={item?.url ?? ""}
            placeholder="https://..."
          />
        </div>
        <div style={{ flex: 1, minWidth: 90 }}>
          <label className="label">大小</label>
          <input className="input" name="fileSize" defaultValue={item?.fileSize ?? ""} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label className="label">备注</label>
          <input
            className="input"
            name="note"
            defaultValue={item?.note ?? ""}
            placeholder="提取码 ab12"
          />
        </div>
        <div style={{ flex: 0, minWidth: 70 }}>
          <label className="label">排序</label>
          <input className="input" name="sort" type="number" defaultValue={item?.sort ?? 0} />
        </div>
      </div>

      <label className="switch-row" style={{ marginTop: 10 }}>
        <input type="hidden" name="enabled" value="0" />
        <input
          type="checkbox"
          name="enabled"
          value="1"
          defaultChecked={mode === "create" ? true : item!.enabled === 1}
        />
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        <span className="switch-text">
          <span className="switch-label">前台显示该镜像</span>
        </span>
      </label>

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <SaveButton label={mode === "create" ? "添加镜像" : "保存镜像"} />
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------ 软件名表单 */

function SoftwareTitleForm({
  software,
  onCancel,
  onSaved,
}: {
  software: AdminSoftwareRow;
  onCancel: () => void;
  /** 保存成功后回调（用来收起表单） */
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(setSoftwareTitleAction, {});

  useEffect(() => {
    if (state.success) onSaved?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <input type="hidden" name="contentId" value={software.contentId} />
      <div style={{ flex: 2, minWidth: 180 }}>
        <label className="label">软件名称</label>
        <input
          className="input"
          name="title"
          defaultValue={software.resourceTitle}
          placeholder={software.contentTitle || "留空则用内容标题"}
        />
      </div>
      <SaveButton label="保存名称" />
      <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
        取消
      </button>
      <div style={{ flexBasis: "100%" }}>
        <Msg state={state} />
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- 主组件 */

export default function DownloadManager({
  software,
  apps,
  categories,
  keyword,
}: {
  software: AdminSoftwareRow[];
  apps: AppOption[];
  categories: CategoryOption[];
  keyword: string;
}) {
  /** 顶部「新增软件」表单（新增才允许出现在列表上方） */
  const [creatingSoftware, setCreatingSoftware] = useState(false);
  /** 哪个软件卡片正在展开「添加平台版本」表单 */
  const [creatingPlatformFor, setCreatingPlatformFor] = useState<number | null>(null);
  /** 哪个平台版本行正在就地编辑（表单渲染在该行下方） */
  const [editingPlatform, setEditingPlatform] = useState<number | null>(null);
  const [addingMirrorFor, setAddingMirrorFor] = useState<number | null>(null);
  const [editingMirror, setEditingMirror] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [collapsed, setCollapsed] = useState<number[]>([]);

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleCollapse = (contentId: number) =>
    setCollapsed((s) => (s.includes(contentId) ? s.filter((x) => x !== contentId) : [...s, contentId]));

  const allIds = software.flatMap((s) => s.platforms.map((p) => p.id));
  const allChecked = allIds.length > 0 && selected.length === allIds.length;

  /** 打开某软件卡片内的「添加平台版本」，同时收掉其它就地表单 */
  const openCreatePlatform = (contentId: number) => {
    setCreatingPlatformFor(creatingPlatformFor === contentId ? null : contentId);
    setEditingPlatform(null);
    setAddingMirrorFor(null);
    setEditingMirror(null);
    setCreatingSoftware(false);
  };

  /** 就地编辑某个平台版本（表单出现在该行正下方） */
  const startEditPlatform = (id: number) => {
    setEditingPlatform(editingPlatform === id ? null : id);
    setCreatingPlatformFor(null);
    setAddingMirrorFor(null);
    setEditingMirror(null);
    setCreatingSoftware(false);
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <form method="get" className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <input
          className="input"
          name="keyword"
          defaultValue={keyword}
          placeholder="搜索软件名称"
          style={{ maxWidth: 260 }}
        />
        <button type="submit" className="btn btn-sm">
          搜索
        </button>
        {keyword ? (
          <a href="/admin/downloads" className="btn btn-sm btn-ghost">
            清除
          </a>
        ) : null}
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setCreatingSoftware((v) => !v);
            setCreatingPlatformFor(null);
            setEditingPlatform(null);
            setAddingMirrorFor(null);
            setEditingMirror(null);
          }}
        >
          {creatingSoftware ? "收起" : "新增软件"}
        </button>
      </form>

      {creatingSoftware ? (
        <SoftwareForm
          apps={apps}
          categories={categories}
          onCancel={() => setCreatingSoftware(false)}
          onSaved={() => setCreatingSoftware(false)}
        />
      ) : null}

      {selected.length > 0 ? (
        <form action={bulkPlatformAction} className="card card-pad bulk-bar">
          <input type="hidden" name="ids" value={selected.join(",")} />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <strong className="nowrap">已选 {selected.length} 个平台版本</strong>
            <button type="submit" name="op" value="enable" className="btn btn-sm">
              批量启用
            </button>
            <button type="submit" name="op" value="disable" className="btn btn-sm btn-outline">
              批量停用
            </button>
            <button
              type="submit"
              name="op"
              value="delete"
              className="btn btn-sm btn-outline"
              style={{ color: "var(--red)", borderColor: "var(--red)" }}
              onClick={(e) => {
                if (!confirm(`确定删除选中的 ${selected.length} 个平台版本？其下的镜像链接会一并删除。`)) {
                  e.preventDefault();
                }
              }}
            >
              批量删除
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>
              取消选择
            </button>
          </div>
        </form>
      ) : null}

      {software.length === 0 ? (
        <div className="empty">
          <div className="empty-title">还没有下载数据</div>
          <div className="text-sm">
            点右上角「新增软件」建一个软件，再在它的卡片里加平台版本（Windows x64 / macOS Apple
            Silicon / Android ARM64…），每个平台下可以加官方下载 / 网盘 / 应用商店等多个镜像链接。
          </div>
        </div>
      ) : null}

      {software.map((soft) => {
        const isCollapsed = collapsed.includes(soft.contentId);
        const mirrorTotal = soft.platforms.reduce((n, p) => n + p.mirrors.length, 0);
        return (
          <section key={soft.contentId} className="card card-pad">
            <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <h3 className="aside-title" style={{ margin: 0 }}>
                {soft.title}
              </h3>
              <span className="badge badge-accent">{soft.platforms.length} 个平台</span>
              <span className="badge">{mirrorTotal} 个镜像</span>
              {soft.contentTitle && soft.resourceTitle && soft.resourceTitle !== soft.contentTitle ? (
                <span className="text-muted text-sm">内容标题：{soft.contentTitle}</span>
              ) : null}
              <span className="spacer" />
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setRenaming(renaming === soft.contentId ? null : soft.contentId)}
              >
                {renaming === soft.contentId ? "取消改名" : "改名称"}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => openCreatePlatform(soft.contentId)}
              >
                {creatingPlatformFor === soft.contentId ? "取消添加" : "+ 平台"}
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggleCollapse(soft.contentId)}>
                {isCollapsed ? "展开" : "收起"}
              </button>
            </div>

            {renaming === soft.contentId ? (
              <div style={{ marginTop: 10 }}>
                <SoftwareTitleForm
                  software={soft}
                  onCancel={() => setRenaming(null)}
                  onSaved={() => setRenaming(null)}
                />
              </div>
            ) : null}

            {/* 添加平台版本：就地展开在本软件卡片里，不跳到页面顶部 */}
            {creatingPlatformFor === soft.contentId ? (
              <div style={{ marginTop: 10 }}>
                <PlatformForm
                  key={`create-${soft.contentId}`}
                  mode="create"
                  contentId={soft.contentId}
                  softwareTitle={soft.title}
                  defaultResourceTitle={soft.resourceTitle}
                  onCancel={() => setCreatingPlatformFor(null)}
                  onSaved={() => setCreatingPlatformFor(null)}
                />
              </div>
            ) : null}

            {isCollapsed ? null : (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input
                          type="checkbox"
                          checked={
                            soft.platforms.length > 0 &&
                            soft.platforms.every((p) => selected.includes(p.id))
                          }
                          onChange={(e) => {
                            const ids = soft.platforms.map((p) => p.id);
                            setSelected((s) =>
                              e.target.checked
                                ? [...new Set([...s, ...ids])]
                                : s.filter((x) => !ids.includes(x))
                            );
                          }}
                        />
                      </th>
                      <th style={{ width: 110 }}>平台</th>
                      <th style={{ width: 96 }}>架构</th>
                      <th style={{ width: 120 }}>版本</th>
                      <th style={{ width: 90 }}>大小</th>
                      <th>镜像链接</th>
                      <th style={{ width: 66 }}>排序</th>
                      <th style={{ width: 76 }}>状态</th>
                      <th style={{ width: 170 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soft.platforms.map((p) => (
                      <PlatformRows
                        key={p.id}
                        soft={soft}
                        platform={p}
                        selected={selected.includes(p.id)}
                        onToggle={() => toggle(p.id)}
                        editing={editingPlatform === p.id}
                        onEdit={() => startEditPlatform(p.id)}
                        addingMirror={addingMirrorFor === p.id}
                        onAddMirror={() => {
                          setAddingMirrorFor(addingMirrorFor === p.id ? null : p.id);
                          setEditingMirror(null);
                          setEditingPlatform(null);
                          setCreatingPlatformFor(null);
                        }}
                        editingMirror={editingMirror}
                        onEditMirror={(id) => {
                          setEditingMirror(editingMirror === id ? null : id);
                          setAddingMirrorFor(null);
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** 一个平台版本行 + 它下面的镜像行（同一个 tbody 里，方便对齐） */
function PlatformRows({
  soft,
  platform: p,
  selected,
  onToggle,
  editing,
  onEdit,
  addingMirror,
  onAddMirror,
  editingMirror,
  onEditMirror,
}: {
  soft: AdminSoftwareRow;
  platform: AdminPlatformRow;
  selected: boolean;
  onToggle: () => void;
  editing: boolean;
  onEdit: () => void;
  addingMirror: boolean;
  onAddMirror: () => void;
  editingMirror: number | null;
  onEditMirror: (id: number) => void;
}) {
  const label = `${soft.title} · ${p.platform || "通用"}${p.arch ? ` ${p.arch}` : ""} ${p.version}`.trim();
  return (
    <>
      <tr style={p.enabled === 0 ? { opacity: 0.6 } : undefined}>
        <td>
          <input type="checkbox" checked={selected} onChange={onToggle} />
        </td>
        <td>
          <span className="badge badge-accent">{p.platform || "通用"}</span>
        </td>
        <td className="text-sm">
          {p.arch ? <span className="badge">{p.arch}</span> : <span className="text-muted">-</span>}
        </td>
        <td className="text-sm">{p.version || "-"}</td>
        <td className="text-muted text-sm">{p.fileSize || "-"}</td>
        <td>
          {p.mirrors.length === 0 ? (
            <span className="text-muted text-sm">还没有镜像链接</span>
          ) : (
            <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
              {p.mirrors.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={onAddMirror}
                  className={`badge ${m.enabled === 1 ? "badge-green" : "badge-red"}`}
                  title={`${m.url}\n点击展开镜像链接列表`}
                  style={{ cursor: "pointer", border: "none", font: "inherit" }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
          {p.note ? <div className="text-muted text-sm">{p.note}</div> : null}
        </td>
        <td className="text-sm mono">{p.sort}</td>
        <td>
          {p.enabled === 1 ? (
            <span className="badge badge-green">显示</span>
          ) : (
            <span className="badge badge-red">隐藏</span>
          )}
        </td>
        <td>
          <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={onEdit}>
              {editing ? "取消" : "编辑"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={onAddMirror}
              title={
                p.mirrors.length > 0
                  ? "展开 / 收起镜像链接列表，可增删改"
                  : "给该平台添加第一个镜像下载链接"
              }
            >
              {p.mirrors.length > 0 ? `镜像 ${p.mirrors.length}` : "+ 镜像"}
            </button>
            <form action={deletePlatformAction}>
              <input type="hidden" name="id" value={p.id} />
              <button
                type="submit"
                className="btn btn-sm btn-outline"
                style={{ color: "var(--red)", borderColor: "var(--red)" }}
                onClick={(e) => {
                  if (!confirm(`删除「${label}」？它下面的 ${p.mirrors.length} 个镜像链接会一并删除。`)) {
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

      {/* 编辑平台版本：就地展开在该行正下方，不跳到页面顶部 */}
      {editing ? (
        <tr>
          <td colSpan={9} style={{ background: "var(--surface-2)", padding: 10 }}>
            <PlatformForm
              key={`edit-${p.id}`}
              mode="edit"
              item={p}
              contentId={p.contentId}
              softwareTitle={soft.title}
              onCancel={onEdit}
              onSaved={onEdit}
            />
          </td>
        </tr>
      ) : null}

      {addingMirror || p.mirrors.some((m) => m.id === editingMirror) ? (
        <tr>
          <td colSpan={9} style={{ background: "var(--surface-2)" }}>
            <div className="stack" style={{ gap: 10 }}>
              {p.mirrors.length > 0 ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 130 }}>镜像名称</th>
                        <th>地址</th>
                        <th style={{ width: 90 }}>大小</th>
                        <th style={{ width: 120 }}>备注</th>
                        <th style={{ width: 60 }}>排序</th>
                        <th style={{ width: 70 }}>状态</th>
                        <th style={{ width: 130 }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.mirrors.map((m) => (
                        <tr key={m.id} style={m.enabled === 0 ? { opacity: 0.6 } : undefined}>
                          <td className="strong">{m.name}</td>
                          <td>
                            <a
                              href={m.url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="text-sm truncate"
                              style={{ wordBreak: "break-all", display: "block" }}
                            >
                              {m.url}
                            </a>
                          </td>
                          <td className="text-muted text-sm">{m.fileSize || "-"}</td>
                          <td className="text-muted text-sm">{m.note || "-"}</td>
                          <td className="text-sm mono">{m.sort}</td>
                          <td>
                            {m.enabled === 1 ? (
                              <span className="badge badge-green">显示</span>
                            ) : (
                              <span className="badge badge-red">隐藏</span>
                            )}
                          </td>
                          <td>
                            <div className="row" style={{ gap: 5 }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                onClick={() => onEditMirror(m.id)}
                              >
                                {editingMirror === m.id ? "取消" : "编辑"}
                              </button>
                              <form action={deleteMirrorAction}>
                                <input type="hidden" name="id" value={m.id} />
                                <button
                                  type="submit"
                                  className="btn btn-sm btn-outline"
                                  style={{ color: "var(--red)", borderColor: "var(--red)" }}
                                  onClick={(e) => {
                                    if (!confirm(`删除镜像「${m.name}」？`)) e.preventDefault();
                                  }}
                                >
                                  删除
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {addingMirror ? (
                <MirrorForm
                  key={`mirror-new-${p.id}`}
                  mode="create"
                  downloadId={p.id}
                  platformLabel={label}
                  onCancel={onAddMirror}
                  onSaved={onAddMirror}
                />
              ) : null}

              {p.mirrors
                .filter((m) => m.id === editingMirror)
                .map((m) => (
                  <MirrorForm
                    key={`mirror-edit-${m.id}`}
                    mode="edit"
                    item={m}
                    downloadId={p.id}
                    platformLabel={label}
                    onCancel={() => onEditMirror(m.id)}
                    onSaved={() => onEditMirror(m.id)}
                  />
                ))}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
