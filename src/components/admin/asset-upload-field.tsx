"use client";

import { useId, useRef, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { uploadContentAssetAction } from "@/lib/actions/media-actions";

/**
 * 图片地址 + 直接上传 + 预览。
 * 内容编辑页的图标 / 封面共用；上传复用素材库的校验与入库逻辑。
 */
export default function AssetUploadField({
  label,
  name,
  value,
  onChange,
  placeholder,
  hint,
  previewStyle,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  previewStyle?: CSSProperties;
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
      ) : hint ? (
        <div className="hint" style={{ marginTop: 6 }}>
          {hint}
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,image/x-icon"
        hidden
        onChange={onFile}
      />
    </div>
  );
}
