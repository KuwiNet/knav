"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  uploadMediaAction,
  localizeMediaAction,
  deleteMediaAction,
  scanMediaAction,
} from "@/lib/actions/media-actions";
import type { FormState } from "@/lib/actions/types";
import {
  formatSize,
  isImageMedia,
  fileExtLabel,
  MAX_BATCH_BYTES,
  MAX_IMAGE_BYTES,
  type MediaItem,
} from "@/lib/media-config";

function UploadButton({ count, blocked }: { count: number; blocked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending || blocked}>
      {pending ? "上传中…" : count > 1 ? `上传 ${count} 个文件` : "上传图片"}
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

function ScanButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-outline" disabled={pending}>
      {pending ? "扫描中…" : "扫描 uploads"}
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
  const [scanState, scanAction] = useActionState<FormState, FormData>(
    scanMediaAction,
    {}
  );
  const [copied, setCopied] = useState("");
  const [picked, setPicked] = useState({ count: 0, bytes: 0 });
  const router = useRouter();

  // 上传/下载成功后整页刷新，清掉文件选择框
  useEffect(() => {
    if (upState.success || loState.success) {
      const t = setTimeout(() => window.location.reload(), 600);
      return () => clearTimeout(t);
    }
  }, [upState.success, loState.success]);

  // 扫描只刷新数据，保留「登记了几个」的提示
  useEffect(() => {
    if (!scanState.success) return;
    const t = setTimeout(() => router.refresh(), 600);
    return () => clearTimeout(t);
  }, [scanState.success, router]);

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
              选择本地文件（可按住 Ctrl / Shift 多选）
            </label>
            <div className="input-row">
              <input
                className="input"
                type="file"
                id="file"
                name="file"
                accept="image/*"
                multiple
                required
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setPicked({
                    count: files.length,
                    bytes: files.reduce((n, f) => n + f.size, 0)
                  });
                }}
              />
              <UploadButton
                count={picked.count}
                blocked={picked.bytes > MAX_BATCH_BYTES}
              />
            </div>
            {picked.count > 1 ? (
              <div className="hint" style={{ marginTop: 8 }}>
                已选 {picked.count} 个文件，共 {formatSize(picked.bytes)}。
              </div>
            ) : null}
            {picked.bytes > MAX_BATCH_BYTES ? (
              <div className="hint" style={{ marginTop: 8, color: "var(--red)" }}>
                一次提交的总量约 {formatSize(picked.bytes)}，超过上限{" "}
                {formatSize(MAX_BATCH_BYTES)}，请减少选择数量（单个文件上限{" "}
                {formatSize(MAX_IMAGE_BYTES)}）。
              </div>
            ) : null}
            <div className="hint" style={{ marginTop: 8 }}>
              上传后自动存入 /uploads/YYYY/MM/，可在内容编辑里直接引用。
              支持 PNG / JPEG / GIF / WebP / AVIF / BMP / ICO / SVG；SVG 会拒绝脚本、事件属性和外链。
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
        <span className="spacer" />
        <form action={scanAction}>
          <ScanButton />
        </form>
      </div>

      <div className="hint" style={{ marginTop: -6 }}>
        直接把 uploads 目录从备份恢复/拷贝进站点后，文件本身不会自动出现在素材库；
        点「扫描 uploads」会把磁盘上已有、数据库里没登记的图片补进来。
      </div>

      {scanState.error ? <div className="alert alert-error">{scanState.error}</div> : null}
      {scanState.success ? (
        <div className="alert alert-success">{scanState.success}</div>
      ) : null}

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
                {isImageMedia(m) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt={m.alt || m.filename} loading="lazy" />
                ) : (
                  <a
                    className="media-file"
                    href={m.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`打开 ${m.filename}`}
                  >
                    <span className="media-file-ext">{fileExtLabel(m.filename)}</span>
                    <span className="media-file-size">{formatSize(m.size)}</span>
                  </a>
                )}
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
