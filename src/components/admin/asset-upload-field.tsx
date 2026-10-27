"use client";

import { useId, useRef, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { uploadContentAssetAction } from "@/lib/actions/media-actions";

/** 首字母图标的底色，按标题哈希取，保证同一条内容颜色稳定 */
const LETTER_BG = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#059669",
  "#0891b2",
  "#4f46e5",
  "#b45309",
];

function escapeXml(text: string): string {
  return text.replace(
    /[<>&"']/g,
    (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[
        c
      ] ?? c
  );
}

/** 用标题首字生成内联 SVG 图标；没有标题时返回空串 */
function letterIconDataUrl(title: string): string {
  const chars = Array.from(title.trim());
  const letter = chars[0];
  if (!letter) return "";

  let hash = 0;
  for (const ch of chars) {
    hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  }
  const bg = LETTER_BG[hash % LETTER_BG.length];

  // 不用 dominant-baseline：老渲染器（邮件客户端等）支持不一致，用基线直接定位
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">' +
    `<rect width="96" height="96" rx="22" fill="${bg}"/>` +
    '<text x="48" y="62" text-anchor="middle" font-family="system-ui,sans-serif" ' +
    `font-size="46" font-weight="600" fill="#fff">${escapeXml(letter.toUpperCase())}</text></svg>`;

  const bytes = new TextEncoder().encode(svg);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

/**
 * 图片地址 + 直接上传 + 预览。
 * 内容编辑页的图标 / 封面共用；上传复用素材库的校验与入库逻辑。
 * 传了 letterSource（通常是标题）时，还会显示「首字母生成」入口。
 */
export default function AssetUploadField({
  label,
  name,
  value,
  onChange,
  placeholder,
  hint,
  previewStyle,
  letterSource,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  previewStyle?: CSSProperties;
  /** 首字母图标取字来源；不传表示这个字段不提供生成入口 */
  letterSource?: string;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null
  );

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 清空选择，同一张图再选一次也能触发 change
    e.target.value = "";
    if (!file) return;

    const fd = new FormData();
    fd.set("file", file);
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await uploadContentAssetAction(fd);
        if (!r.ok) {
          setMsg({ kind: "error", text: r.error });
          return;
        }
        onChange(r.url);
        setMsg({ kind: "ok", text: "已上传，保存内容后生效" });
      } catch (err) {
        setMsg({ kind: "error", text: `上传失败：${(err as Error).message}` });
      }
    });
  };

  const generateLetter = () => {
    const dataUrl = letterIconDataUrl(letterSource ?? "");
    if (!dataUrl) {
      setMsg({ kind: "error", text: "请先填写标题，再用首字母生成图标" });
      return;
    }
    onChange(dataUrl);
    setMsg({ kind: "ok", text: "已生成首字母图标，保存内容后生效" });
  };

  return (
    <div className="field" style={{ flex: 1, minWidth: 240, margin: 0 }}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="media-field">
        <div className="input-row" style={{ flex: 1, minWidth: 0 }}>
          <input
            id={id}
            className="input"
            name={name}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setMsg(null);
            }}
            placeholder={placeholder}
          />
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
          >
            {pending ? "上传中…" : value ? "更换" : "上传"}
          </button>
          {value ? (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => {
                onChange("");
                setMsg(null);
              }}
              disabled={pending}
            >
              清除
            </button>
          ) : null}
        </div>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={value}
            src={value}
            alt={label}
            className="media-preview"
            style={previewStyle}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>
      {msg ? (
        <div
          className="hint"
          style={{
            marginTop: 6,
            color: msg.kind === "error" ? "var(--red)" : "var(--green)",
          }}
        >
          {msg.text}
        </div>
      ) : null}
      {hint || letterSource !== undefined ? (
        <div className="hint" style={{ marginTop: 6 }}>
          {hint}
          {letterSource !== undefined ? (
            <>
              {hint ? "；" : ""}
              <button
                type="button"
                className="link-btn"
                onClick={generateLetter}
                disabled={pending}
              >
                用标题首字母生成
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,image/x-icon,image/svg+xml,.svg"
        hidden
        onChange={onFile}
      />
    </div>
  );
}
