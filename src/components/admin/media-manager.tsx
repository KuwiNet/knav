"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  uploadMediaAction,
  localizeMediaAction,
  deleteMediaAction,
} from "@/lib/actions/media-actions";
import type { FormState } from "@/lib/actions/types";
import { formatSize, type MediaItem } from "@/lib/media-config";

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? "上传中…" : "上传图片"}
    </button>
  );
}

function LocalizeButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-outline" disabled={pending}>
      {pending ? "下载中…" : "下载到本地"}
    </button>
  );
}

export default function MediaManager({
  items,
  total,
  keyword,
}: {
  items: MediaItem[];
  total: number;
  keyword: string;
}) {
  const [upState, upAction] = useActionState<FormState, FormData>(
    uploadMediaAction,
    {}
  );
  const [loState, loAction] = useActionState<FormState, FormData>(
    localizeMediaAction,
    {}
  );
  const [copied, setCopied] = useState("");

  // 保存成功后刷新页面数据
  useEffect(() => {
    if (upState.success || loState.success) {
      const t = setTimeout(() => window.location.reload(), 400);
      return () => clearTimeout(t);
    }
  }, [upState.success, loState.success]);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="stat-grid" style={{ marginBottom: 0 }}>
        <div className="stat">
          <div className="stat-label">素材总数</div>
          <div className="stat-value">{total}</div>
        </div>
        <div className="stat">
          <div className="stat-label">本页显示</div>
          <div className="stat-value">{items.length}</div>
        </div>
      </div>

      <div className="card card-pad">
        <h2 className="aside-title" style={{ marginTop: 0 }}>
          上传图片
        </h2>
        {upState.error ? (
          <div className="alert alert-error">{upState.error}</div>
        ) : null}
        {upState.success ? (
          <div className="alert alert-success">{upState.success}</div>
        ) : null}
        <form action={upAction}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="file">
              选择本地文件
            </label>
            <div className="input-row">
              <input className="input" type="file" id="file" name="file" accept="image/*" required />
              <UploadButton />
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              上传后自动存入 /uploads/YYYY/MM/，可在内容编辑里直接引用。
            </div>
          </div>
        </form>
      </div>

      <div className="card card-pad">
        <h2 className="aside-title" style={{ marginTop: 0 }}>
          外链图片本地化
        </h2>
        {loState.error ? (
          <div className="alert alert-error">{loState.error}</div>
        ) : null}
        {loState.success ? (
          <div className="alert alert-success">{loState.success}</div>
        ) : null}
        <form action={loAction}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="url">
              图片地址
            </label>
            <div className="input-row">
              <input
                className="input"
                id="url"
                name="url"
                placeholder="https://example.com/a.png"
                required
              />
              <LocalizeButton />
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              后台保存网址/文章时，填写的远程图片地址也会自动下载到本地并改写为本地链接。
            </div>
          </div>
        </form>
      </div>

      <div className="toolbar">
        <form method="get" className="row" style={{ gap: 8 }}>
          <input
            className="input"
            type="search"
            name="q"
            placeholder="搜索文件名 / 来源地址"
            defaultValue={keyword}
            style={{ minWidth: 220 }}
          />
          <button type="submit" className="btn btn-outline">
            搜索
          </button>
        </form>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-title">还没有素材</div>
          <div>上传图片或把外链图片下载到本地后会显示在这里。</div>
        </div>
      ) : (
        <div className="media-grid">
          {items.map((m) => (
            <div key={m.id} className="media-item">
              <div className="media-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.alt || m.filename} loading="lazy" />
              </div>
              <div className="media-meta">
                <div className="media-name truncate" title={m.filename}>
                  {m.filename}
                </div>
                <div className="text-sm text-muted">
                  {formatSize(m.size)}
                  {m.width ? ` · ${m.width}×${m.height}` : ""}
                </div>
                <div className="text-sm text-muted truncate" title={m.sourceUrl}>
                  {m.sourceUrl || "本地上传"}
                </div>
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => copy(m.url)}
                  >
                    {copied === m.url ? "已复制" : "复制地址"}
                  </button>
                  <form action={deleteMediaAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <button
                      type="submit"
                      className="btn btn-sm btn-outline"
                      style={{ color: "var(--red)", borderColor: "var(--red)" }}
                      onClick={(e) => {
                        if (!confirm(`删除素材「${m.filename}」？文件会一并从磁盘移除。`)) {
                          e.preventDefault();
                        }
                      }}
                    >
                      删除
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
