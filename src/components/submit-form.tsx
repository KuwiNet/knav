"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  submitAction,
  fetchSubmitMetaAction,
} from "@/lib/actions/submission-actions";
import CategorySelect from "@/components/admin/category-select";
import MarkdownEditor from "@/components/admin/markdown-editor";
import type { Category } from "@/lib/content";
import type { FormState } from "@/lib/actions/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-lg" disabled={pending}>
      {pending ? "提交中…" : "提交审核"}
    </button>
  );
}

export default function SubmitForm({
  categories,
  tagNames,
}: {
  categories: Category[];
  tagNames: string[];
}) {
  const [state, action] = useActionState<FormState, FormData>(submitAction, {});
  const [type, setType] = useState<"site" | "article">("site");
  // 这四个字段要被「获取信息」回填，所以做成受控
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState("");

  const onFetchInfo = async () => {
    if (!url.trim()) {
      setFetchMsg("请先填写网址");
      return;
    }
    setFetching(true);
    setFetchMsg("");
    try {
      const r = await fetchSubmitMetaAction(url.trim());
      if (!r.ok) {
        setFetchMsg(r.error ?? "获取失败");
        return;
      }
      if (r.title && !title.trim()) setTitle(r.title);
      if (r.description && !description.trim()) setDescription(r.description);
      if (r.cover) setCover(r.cover);
      setFetchMsg("已抓到站点信息，空的字段会自动填上，确认后提交");
    } catch (e) {
      setFetchMsg(`获取失败：${(e as Error).message}`);
    } finally {
      setFetching(false);
    }
  };

  return (
    <form action={action} className="card card-pad">
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? (
        <div className="alert alert-success">
          {state.success}
          <div style={{ marginTop: 10 }}>
            <a className="btn btn-sm" href="/dashboard/submissions">
              查看我的投稿
            </a>
          </div>
        </div>
      ) : null}

      {/* 类型选择 */}
      <div className="field">
        <span className="label">投稿类型</span>
        <div style={{ display: "flex", gap: 10 }}>
          <label
            className="badge"
            style={{
              cursor: "pointer",
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${type === "site" ? "var(--accent)" : "var(--border)"}`,
              background: type === "site" ? "var(--accent-soft)" : "transparent",
              color: type === "site" ? "var(--accent)" : "var(--text-2)",
            }}
          >
            <input
              type="radio"
              name="type"
              value="site"
              checked={type === "site"}
              onChange={() => setType("site")}
              style={{ marginRight: 6 }}
            />
            网址收藏
          </label>
          <label
            className="badge"
            style={{
              cursor: "pointer",
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${type === "article" ? "var(--accent)" : "var(--border)"}`,
              background: type === "article" ? "var(--accent-soft)" : "transparent",
              color: type === "article" ? "var(--accent)" : "var(--text-2)",
            }}
          >
            <input
              type="radio"
              name="type"
              value="article"
              checked={type === "article"}
              onChange={() => setType("article")}
              style={{ marginRight: 6 }}
            />
            文章（Markdown）
          </label>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="title">
          标题
        </label>
        <input
          className="input"
          id="title"
          name="title"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === "site" ? "网站名称" : "文章标题"}
        />
      </div>

      {type === "site" ? (
        <>
          <div className="field">
            <label className="label" htmlFor="url">
              网址
            </label>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input
                className="input"
                id="url"
                name="url"
                type="url"
                required
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
              必须以 http:// 或 https:// 开头。点「获取信息」自动抓取对方站点的名称、简介和图标。
            </div>
            {fetchMsg ? (
              <div
                className="text-sm"
                style={{
                  marginTop: 6,
                  color: fetchMsg.includes("已抓到") ? "var(--green)" : "var(--red)",
                }}
              >
                {fetchMsg}
              </div>
            ) : null}
          </div>
          <div className="field">
            <label className="label" htmlFor="cover">
              图标地址（可选）
            </label>
            <input
              className="input"
              id="cover"
              name="cover"
              value={cover}
              onChange={(e) => setCover(e.target.value)}
              placeholder="https://example.com/favicon.ico"
            />
          </div>
        </>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="description">
          简介{type === "site" ? " / 摘要" : ""}
        </label>
        <textarea
          className="textarea"
          id="description"
          name="description"
          rows={3}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="一句话介绍这个站点 / 文章"
        />
      </div>

      {type === "article" ? (
        <div className="field">
          <label className="label">正文（Markdown）</label>
          <MarkdownEditor
            name="contentMd"
            required
            mediaPicker={false}
            minHeight={340}
            placeholder={"支持标准 Markdown：\n\n## 小标题\n\n- 列表项\n\n```bash\n命令\n```"}
          />
          <div className="hint">
            工具栏可插入标题、列表、代码、链接与图片；正文里的外链图片会在审核通过后自动下载到本站。
          </div>
        </div>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="categoryId">
          分类
        </label>
        <CategorySelect
          id="categoryId"
          name="categoryId"
          value={0}
          categories={categories}
          required
          emptyLabel="请选择一个分类"
          placeholder="请选择一个分类"
        />
        <div className="hint">
          网址与文章使用同一套分类体系，只能归入已有分类；没有合适的分类就先选最接近的一个，
          审核时管理员会按情况调整或新建。
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="tags">
          标签（可选）
        </label>
        <input
          className="input"
          id="tags"
          name="tags"
          list="tag-options"
          placeholder="用逗号分隔，如：VPS, 教程, 开源"
        />
        <datalist id="tag-options">
          {tagNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <div className="hint">已存在的标签可直接选择，输入新标签会自动创建。</div>
      </div>

      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <SubmitButton />
        <span className="hint">提交后进入审核队列，通过后自动发布并邮件通知。</span>
      </div>
    </form>
  );
}
