"use client";

import { Fragment, useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  createContentAction,
  updateContentAction,
  getContentDetailAction,
  bulkContentAction,
  moveContentAction,
  setContentStatusAction,
  deleteContentAction,
  fetchSiteMetaAction,
} from "@/lib/actions/admin-actions";
import type { FormState } from "@/lib/actions/types";
import type { AdminContentRow } from "@/lib/admin";
import type { AdminContentDetail, PlatformVersion } from "@/lib/admin-types";
import { PLATFORM_PRESETS, MIRROR_PRESETS, ARCH_PRESETS } from "@/lib/admin-types";
import type { Category } from "@/lib/content";
import MarkdownEditor from "@/components/admin/markdown-editor";
import AssetUploadField from "@/components/admin/asset-upload-field";
import CategorySelect, {
  CategoryMultiSelect,
} from "@/components/admin/category-select";

type ContentType = "site" | "article" | "app";

const TYPE_LABEL: Record<string, string> = {
  site: "网址",
  article: "文章",
  app: "应用",
};

const TYPE_TABS: { key: string; label: string }[] = [
  { key: "", label: "全部" },
  { key: "site", label: "网址" },
  { key: "article", label: "文章" },
  { key: "app", label: "应用" },
];

// 平台、架构与镜像名称统一定义在 admin-types，后台内容页与下载管理页共用一份
const PLATFORMS = PLATFORM_PRESETS;
const ARCHS = ARCH_PRESETS;
const MIRRORS = MIRROR_PRESETS;

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

/* ---------------------------------------------------------------- 编辑表单 */

function ContentForm({
  mode,
  detail,
  categories,
  defaultType,
  onSaved,
}: {
  mode: "create" | "edit";
  detail?: AdminContentDetail | null;
  categories: Category[];
  defaultType?: ContentType;
  /** 保存成功后回调（用来收起表单） */
  onSaved?: () => void;
}) {
  const action = mode === "create" ? createContentAction : updateContentAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [type, setType] = useState<ContentType>(
    detail?.type ?? defaultType ?? "site"
  );

  useEffect(() => {
    if (state.success) onSaved?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  // 网址 / 标题 / 简介 / 图标都做成受控的：
  // 「获取信息」按钮拿到对方站点的数据后要能直接回填
  const [title, setTitle] = useState(detail?.title ?? "");
  const [url, setUrl] = useState(detail?.url ?? "");
  const [description, setDescription] = useState(detail?.description ?? "");
  const [icon, setIcon] = useState(detail?.icon ?? "");
  const [cover, setCover] = useState(detail?.cover ?? "");
  const [categoryIds, setCategoryIds] = useState<number[]>(
    detail?.categoryIds?.length
      ? detail.categoryIds
      : detail?.categoryId
        ? [detail.categoryId]
        : []
  );

  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState("");

  // 多平台版本
  const [versions, setVersions] = useState<PlatformVersion[]>(
    detail?.versions ?? []
  );
  // 只有动过列表才把 versions 传给服务端，避免覆盖「下载管理」里的记录
  const [versionsDirty, setVersionsDirty] = useState(false);

  const onFetchInfo = async () => {
    if (!url.trim()) {
      setFetchMsg("请先填写网址");
      return;
    }
    setFetching(true);
    setFetchMsg("");
    try {
      const r = await fetchSiteMetaAction(url.trim());
      if (!r.ok) {
        setFetchMsg(r.error);
        return;
      }
      if (r.title) setTitle(r.title);
      if (r.description) setDescription(r.description);
      if (r.icon) setIcon(r.icon);
      if (r.cover) setCover(r.cover);
      setFetchMsg("已获取到站点信息，确认后点保存");
    } catch (e) {
      setFetchMsg(`获取失败：${(e as Error).message}`);
    } finally {
      setFetching(false);
    }
  };

  const updateVersion = (i: number, patch: Partial<PlatformVersion>) => {
    setVersions((v) => v.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
    setVersionsDirty(true);
  };

  return (
    <form action={formAction} className="card card-pad content-edit-form">
      {mode === "edit" && detail ? <input type="hidden" name="id" value={detail.id} /> : null}
      <h3 className="aside-title" style={{ marginTop: 0 }}>
        {mode === "create" ? "新增内容" : `编辑内容：${detail?.title ?? ""}`}
      </h3>
      <Msg state={state} />

      <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 0, minWidth: 120 }}>
          <label className="label">类型</label>
          <select
            className="input"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as ContentType)}
          >
            <option value="site">网址</option>
            <option value="article">文章</option>
            <option value="app">应用 / 下载</option>
          </select>
        </div>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label className="label">标题</label>
          <input
            className="input"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="显示名称"
          />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label className="label">分类（可多选）</label>
          <CategoryMultiSelect
            name="categoryIds"
            values={categoryIds}
            categories={categories}
            placeholder="（选择分类）"
            onChange={setCategoryIds}
          />
        </div>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        一条内容可同时归入多个分类，列表里用第一个作为主分类；投稿仍只能选一个分类。
      </div>

      {type === "site" ? (
        <div className="field" style={{ marginTop: 12 }}>
          <label className="label">链接地址</label>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input
              className="input"
              name="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              style={{ flex: 1, minWidth: 220 }}
            />
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={onFetchInfo}
              disabled={fetching}
            >
              {fetching ? "获取中…" : "获取信息"}
            </button>
          </div>
          <div className="hint">
            填好网址后点「获取信息」，自动抓取对方站点的名称、简介和图标。
          </div>
          {fetchMsg ? (
            <div className="text-sm" style={{ marginTop: 6, color: fetchMsg.includes("已获取") ? "var(--green)" : "var(--red)" }}>
              {fetchMsg}
            </div>
          ) : null}
        </div>
      ) : null}

      {type === "app" ? (
        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label className="label">主页 / 主下载地址</label>
            <input
              className="input"
              name="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/app.exe"
            />
          </div>
          <div style={{ flex: 0, minWidth: 120 }}>
            <label className="label">版本</label>
            <input className="input" name="version" defaultValue={detail?.version ?? ""} placeholder="1.2.0" />
          </div>
          <div style={{ flex: 0, minWidth: 120 }}>
            <label className="label">平台</label>
            <select className="input" name="platform" defaultValue={detail?.platform ?? ""}>
              <option value="">不限</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <div className="field" style={{ marginTop: 12 }}>
        <label className="label">简介 / 摘要</label>
        <textarea
          className="textarea"
          name="description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={type === "article" ? "文章摘要，会显示在卡片上" : "一句话介绍"}
        />
      </div>

      {type === "article" ? (
        <div className="field" style={{ marginTop: 12 }}>
          <label className="label">正文（Markdown）</label>
          <MarkdownEditor name="contentMd" value={detail?.contentMd ?? ""} minHeight={420} />
          <div className="hint">
            保存后会在后台把正文里的远程图片下载到本地并替换链接，不影响保存速度。
          </div>
        </div>
      ) : null}

      {/* 同一个软件可以加多个平台版本 */}
      {type === "app" ? (
        <details
          className="field"
          style={{ marginTop: 12 }}
          open={versions.length > 0}
        >
          <summary className="label" style={{ cursor: "pointer", marginBottom: 8 }}>
            多平台版本（{versions.length}）
          </summary>
          <div className="hint" style={{ marginBottom: 8 }}>
            同一个软件可以分别提供 Windows / macOS / Linux / Android 等版本，每个版本一条记录，
            前台应用页按平台逐条展示。同一个平台还能再分架构（Windows x64 / ARM64、
            macOS Intel / Apple Silicon），各填一条。这里填的地址是该平台的「主下载链接」；
            要给同一个平台再加百度网盘、123网盘、App Store 等镜像，去「下载管理」里维护。
          </div>

          {versions.length > 0 ? (
            <div className="stack" style={{ gap: 8, marginBottom: 10 }}>
              {versions.map((v, i) => (
                <div
                  key={i}
                  className="stack"
                  style={{
                    gap: 6,
                    padding: 8,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <input
                      className="input"
                      list="kw-platform-options"
                      value={v.platform}
                      onChange={(e) => updateVersion(i, { platform: e.target.value })}
                      placeholder="平台"
                      title="平台：Windows / macOS / Linux / Android …"
                      style={{ width: 120 }}
                    />
                    <input
                      className="input"
                      list="kw-arch-options"
                      value={v.arch}
                      onChange={(e) => updateVersion(i, { arch: e.target.value })}
                      placeholder="架构"
                      title="架构：x64 / ARM64 / Apple Silicon …，留空表示该平台不区分架构"
                      style={{ width: 110 }}
                    />
                    <input
                      className="input"
                      value={v.version}
                      onChange={(e) => updateVersion(i, { version: e.target.value })}
                      placeholder="版本号"
                      style={{ width: 110 }}
                    />
                    <input
                      className="input"
                      value={v.fileSize}
                      onChange={(e) => updateVersion(i, { fileSize: e.target.value })}
                      placeholder="大小"
                      style={{ width: 90 }}
                    />
                    <span className="spacer" />
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ color: "var(--red)", borderColor: "var(--red)" }}
                      onClick={() => {
                        setVersions((list) => list.filter((_, idx) => idx !== i));
                        setVersionsDirty(true);
                      }}
                    >
                      移除
                    </button>
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      className="input"
                      value={v.name}
                      onChange={(e) => updateVersion(i, { name: e.target.value })}
                      list="kw-mirror-options"
                      placeholder="主链接名称，如 官方下载"
                      style={{ width: 170 }}
                    />
                    <input
                      className="input"
                      value={v.url}
                      onChange={(e) => updateVersion(i, { url: e.target.value })}
                      placeholder="主下载地址"
                      style={{ flex: 2, minWidth: 200 }}
                    />
                    {v.mirrorCount && v.mirrorCount > 1 ? (
                      <a
                        href={`/admin/downloads?contentId=${detail?.id ?? 0}`}
                        className="badge badge-accent nowrap"
                        title="该平台还有其它镜像链接，点开下载管理查看"
                      >
                        共 {v.mirrorCount} 个镜像
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <datalist id="kw-platform-options">
            {PLATFORMS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <datalist id="kw-arch-options">
            {ARCHS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <datalist id="kw-mirror-options">
            {MIRRORS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => {
              setVersions((v) => [
                ...v,
                { name: "官方下载", platform: "Windows", arch: "", version: "", url: "", fileSize: "" },
              ]);
              setVersionsDirty(true);
            }}
          >
            + 添加平台版本
          </button>

          {versionsDirty ? (
            <input
              type="hidden"
              name="versions"
              value={JSON.stringify(
                // 平台 / 版本 / 地址任一有值就提交，
                // 免得把「下载管理」里建好但还没填地址的平台版本删掉
                versions.filter(
                  (v) => v.platform.trim() || v.version.trim() || v.url.trim()
                )
              )}
            />
          ) : null}
        </details>
      ) : null}

      <div
        className="row"
        style={{ gap: 16, marginTop: 12, alignItems: "flex-start", flexWrap: "wrap" }}
      >
        <AssetUploadField
          label="自定义图标"
          name="icon"
          value={icon}
          onChange={setIcon}
          placeholder="图片地址，或直接上传"
          hint="建议方形图标；远程图片保存后会自动下载到本地"
          letterSource={title}
        />
        {type === "article" ? (
          <AssetUploadField
            label="封面图"
            name="cover"
            value={cover}
            onChange={setCover}
            placeholder="图片地址，或直接上传"
            hint="文章无图标时用作缩略图"
            previewStyle={{ width: 88, objectFit: "cover" }}
          />
        ) : null}
      </div>

      <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label className="label">标签</label>
          <input className="input" name="tags" defaultValue={detail?.tags ?? ""} placeholder="逗号分隔，如：教程, Docker" />
        </div>
        <div style={{ flex: 0, minWidth: 100 }}>
          <label className="label">排序</label>
          <input className="input" name="order" type="number" defaultValue={detail?.order ?? 0} />
        </div>
        <div style={{ flex: 0, minWidth: 130 }}>
          <label className="label">状态</label>
          <select className="input" name="status" defaultValue={detail?.status ?? "publish"}>
            <option value="publish">已发布</option>
            <option value="draft">草稿</option>
            <option value="trash">回收站</option>
          </select>
        </div>
        <div style={{ flex: 0, minWidth: 120 }}>
          <label className="label">发布时间</label>
          <input className="input" name="date" type="date" defaultValue={detail?.date ?? ""} />
        </div>
        <label
          className="switch-row"
          style={{ alignItems: "center", paddingTop: 18 }}
        >
          <input type="hidden" name="sticky" value="0" />
          <input type="checkbox" name="sticky" value="1" defaultChecked={detail?.sticky === 1} />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span className="switch-text">
            <span className="switch-label">置顶</span>
          </span>
        </label>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 14 }}>
        <SaveButton label={mode === "create" ? "创建内容" : "保存修改"} />
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- 主组件 */

export default function ContentManager({
  items,
  categories,
  type,
  keyword,
  categoryId,
}: {
  items: AdminContentRow[];
  categories: Category[];
  type: string;
  keyword: string;
  categoryId: number;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [detail, setDetail] = useState<AdminContentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkOp, setBulkOp] = useState("");
  const [bulkCat, setBulkCat] = useState(0);
  const filterFormRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const allChecked = items.length > 0 && selected.length === items.length;

  const startEdit = async (id: number) => {
    if (editing === id) {
      setEditing(null);
      setDetail(null);
      return;
    }
    setCreating(false);
    setEditing(id);
    setDetail(null);

    // 网址需要的字段列表里已经带全，直接就地展开；文章/应用按需再取完整内容
    const row = items.find((x) => x.id === id);
    if (row && row.type === "site") {
      setLoading(false);
      setDetail({
        id: row.id,
        type: "site",
        title: row.title,
        url: row.url,
        description: row.description,
        contentMd: "",
        categoryId: row.categoryIds[0] ?? 0,
        categoryIds: row.categoryIds,
        tags: row.tags,
        icon: row.icon,
        cover: row.cover,
        order: row.order,
        sticky: row.sticky,
        status: row.status,
        date: String(row.date).slice(0, 10),
        version: "",
        platform: "",
        versions: [],
      });
      return;
    }

    setLoading(true);
    try {
      const d = await getContentDetailAction(id);
      setDetail(d);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        {TYPE_TABS.map((t) => (
          <a
            key={t.key || "all"}
            href={
              t.key
                ? `/admin/content?type=${t.key}${categoryId ? `&categoryId=${categoryId}` : ""}`
                : `/admin/content${categoryId ? `?categoryId=${categoryId}` : ""}`
            }
            className={`btn btn-sm ${type === t.key ? "" : "btn-outline"}`}
          >
            {t.label}
          </a>
        ))}
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setCreating((v) => !v);
            setEditing(null);
          }}
        >
          {creating ? "收起" : "新增内容"}
        </button>
      </div>

      <form method="get" className="row" style={{ gap: 10, flexWrap: "wrap" }} ref={filterFormRef}>
        <input
          className="input"
          name="keyword"
          defaultValue={keyword}
          placeholder="搜索标题"
          style={{ maxWidth: 280 }}
        />
        <div style={{ width: "auto", minWidth: 200 }}>
          <CategorySelect
            name="categoryId"
            value={categoryId || 0}
            categories={categories}
            emptyLabel="全部分类"
            placeholder="全部分类"
            onChange={() => {
              // 筛选是 GET 表单，选完就提交
              requestAnimationFrame(() => filterFormRef.current?.requestSubmit());
            }}
          />
        </div>
        <input type="hidden" name="type" value={type} />
        <button type="submit" className="btn btn-sm">
          搜索
        </button>
        {categoryId ? (
          <a href="/admin/content" className="btn btn-sm btn-ghost">
            清除筛选
          </a>
        ) : null}
      </form>

      {categoryId ? (
        <div className="hint">
          已按分类筛选（选顶级分类会一并列出其下所有子分类的内容）。
          上移 / 下移只在该分类内部生效，不影响其它分类的顺序。
        </div>
      ) : null}

      {creating ? (
        <ContentForm
          mode="create"
          categories={categories}
          defaultType="site"
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}

      {/* 编辑表单不放在这里：一律就地展开在被编辑那一行的正下方，
          否则列表一长，点「编辑」就得滚回页面顶部去改。 */}

      {selected.length > 0 ? (
        <form action={bulkContentAction} className="card card-pad bulk-bar">
          <input type="hidden" name="ids" value={selected.join(",")} />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <strong className="nowrap">已选 {selected.length} 项</strong>
            <select
              className="input"
              name="op"
              value={bulkOp}
              onChange={(e) => setBulkOp(e.target.value)}
              style={{ width: "auto", minWidth: 150 }}
            >
              <option value="">批量操作…</option>
              <option value="publish">发布</option>
              <option value="draft">转为草稿</option>
              <option value="trash">移入回收站</option>
              <option value="sticky">置顶</option>
              <option value="unstick">取消置顶</option>
              <option value="category">调整分类</option>
              <option value="delete">删除</option>
            </select>
            {bulkOp === "category" ? (
              <div style={{ width: "auto", minWidth: 200 }}>
                <CategorySelect
                  name="categoryId"
                  value={bulkCat}
                  categories={categories}
                  emptyLabel="选择分类"
                  placeholder="选择分类"
                  onChange={(id) => setBulkCat(id)}
                />
              </div>
            ) : null}
            <button
              type="submit"
              className="btn btn-sm"
              onClick={(e) => {
                if (bulkOp === "delete" && !confirm(`确定删除选中的 ${selected.length} 项？`)) {
                  e.preventDefault();
                }
              }}
            >
              执行
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelected([])}
            >
              取消选择
            </button>
          </div>
        </form>
      ) : null}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() =>
                    setSelected(allChecked ? [] : items.map((i) => i.id))
                  }
                />
              </th>
              <th style={{ width: 54 }}>ID</th>
              <th>标题</th>
              <th style={{ width: 74 }}>类型</th>
              <th style={{ width: 110 }}>分类</th>
              <th style={{ width: 60 }}>排序</th>
              <th style={{ width: 74 }}>浏览</th>
              <th style={{ width: 100 }}>日期</th>
              <th style={{ width: 250 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <Fragment key={c.id}>
              <tr>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                </td>
                <td className="text-muted">{c.id}</td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    {c.icon || c.cover ? (
                      <span className="cat-icon-cell">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={c.icon || c.cover}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </span>
                    ) : null}
                    <div style={{ minWidth: 0 }}>
                      <a
                        href={
                          c.type === "site"
                            ? `/sites/${c.id}.html`
                            : c.type === "app"
                              ? `/app/${c.id}.html`
                              : `/${c.id}.html`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="table-link strong"
                      >
                        {c.title}
                      </a>
                      <div className="row" style={{ gap: 5, marginTop: 2 }}>
                        {c.sticky === 1 ? (
                          <span className="badge badge-amber">置顶</span>
                        ) : null}
                        {c.status !== "publish" ? (
                          <span className="badge">
                            {c.status === "draft" ? "草稿" : c.status === "trash" ? "回收站" : c.status}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="badge">{TYPE_LABEL[c.type]}</span>
                </td>
                <td className="text-muted text-sm">{c.categoryName || "-"}</td>
                <td className="text-sm mono">{c.order}</td>
                <td className="text-muted text-sm">{c.views.toLocaleString("zh-CN")}</td>
                <td className="text-muted text-sm nowrap">{String(c.date).slice(0, 10)}</td>
                <td>
                  <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => startEdit(c.id)}
                    >
                      {editing === c.id ? "取消" : "编辑"}
                    </button>
                    <form action={moveContentAction} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="dir" value="up" />
                      {categoryId ? (
                        <input type="hidden" name="categoryId" value={categoryId} />
                      ) : null}
                      <button type="submit" className="btn btn-sm btn-outline" title="上移">
                        ↑
                      </button>
                    </form>
                    <form action={moveContentAction} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="dir" value="down" />
                      {categoryId ? (
                        <input type="hidden" name="categoryId" value={categoryId} />
                      ) : null}
                      <button type="submit" className="btn btn-sm btn-outline" title="下移">
                        ↓
                      </button>
                    </form>
                    <form action={setContentStatusAction} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={c.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={c.status === "publish" ? "draft" : "publish"}
                      />
                      <button type="submit" className="btn btn-sm btn-outline">
                        {c.status === "publish" ? "下线" : "发布"}
                      </button>
                    </form>
                    <form action={deleteContentAction} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        className="btn btn-sm btn-outline"
                        style={{ color: "var(--red)", borderColor: "var(--red)" }}
                        onClick={(e) => {
                          if (!confirm(`确定删除《${c.title}》？该操作不可撤销。`)) {
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

              {/* 编辑表单就地展开在该行正下方 */}
              {editing === c.id ? (
                <tr>
                  <td
                    colSpan={9}
                    className="content-edit-cell"
                    style={{ background: "var(--surface-2)", padding: 10 }}
                  >
                    {loading ? (
                      <div className="text-muted">正在加载内容…</div>
                    ) : detail ? (
                      <ContentForm
                        key={detail.id}
                        mode="edit"
                        detail={detail}
                        categories={categories}
                        onSaved={() => {
                          setEditing(null);
                          setDetail(null);
                          // 保存接口不再整页回传，列表在后台刷新，不阻塞「保存中」
                          router.refresh();
                        }}
                      />
                    ) : (
                      <div className="text-muted">内容不存在或已被删除。</div>
                    )}
                  </td>
                </tr>
              ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
