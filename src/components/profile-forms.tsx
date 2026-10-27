"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  updateProfileAction,
  changePasswordAction,
  changeEmailAction,
  saveAvatarAction,
} from "@/lib/actions/auth-actions";
import { AVATAR_PRESETS, MAX_AVATAR_BYTES } from "@/lib/avatar-config";
import type { AvatarState, FormState } from "@/lib/actions/types";
import type { User } from "@/lib/auth";
import Avatar from "@/components/avatar";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? "保存中…" : label}
    </button>
  );
}

function Alert({ state }: { state: FormState }) {
  if (state.error) return <div className="alert alert-error">{state.error}</div>;
  if (state.success) return <div className="alert alert-success">{state.success}</div>;
  return null;
}

/**
 * 头像面板：内置头像一键换、上传图片、改回默认首字母，点一下就立即保存。
 * 三种操作共用一个表单，所以不需要「先选再保存」这种两步动作。
 */
function SwatchButton({
  value,
  label,
  active,
  children,
}: {
  value: string;
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="src"
      value={value}
      title={label}
      aria-label={label}
      className={`avatar-swatch${active ? " is-active" : ""}`}
      disabled={pending}
    >
      {children}
    </button>
  );
}

export function AvatarPanel({ user }: { user: User }) {
  const [state, action] = useActionState<AvatarState, FormData>(saveAvatarAction, {});
  const [fileName, setFileName] = useState("");
  const swatchesRef = useRef<HTMLDivElement>(null);
  // 保存成功后用返回值显示，不必等整页刷新
  const current = state.avatar !== undefined ? state.avatar : user.avatar;
  const name = user.nickname || user.username;

  // 头像排成一行可横向滚动，选中项在可视区外时把它滚进来
  useEffect(() => {
    const box = swatchesRef.current;
    const active = box?.querySelector<HTMLElement>(".avatar-swatch.is-active");
    if (!box || !active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < box.scrollLeft || right > box.scrollLeft + box.clientWidth) {
      box.scrollTo({
        left: left - box.clientWidth / 2 + active.offsetWidth / 2,
        behavior: "smooth",
      });
    }
  }, [current]);

  return (
    <div className="card card-pad">
      <h2 className="aside-title" style={{ marginTop: 0 }}>
        头像
      </h2>
      <Alert state={state} />
      <form action={action} encType="multipart/form-data" className="avatar-panel">
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <Avatar src={current} name={name} size={64} />
          <div style={{ minWidth: 0 }}>
            <div className="strong">{name}</div>
            <div className="hint">
              {fileName
                ? `已选择：${fileName}`
                : `支持 PNG / JPEG / GIF / WebP，最大 ${Math.round(MAX_AVATAR_BYTES / 1024 / 1024)} MB。方形图最好看，非方形按中心裁切`}
            </div>
          </div>
        </div>

        <div className="avatar-upload-row">
          <label className="btn btn-sm btn-outline">
            选择图片
            <input
              type="file"
              name="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              hidden
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            />
          </label>
          <SubmitButton label="上传并保存" />
        </div>

        <div>
          <div className="label">系统内置头像</div>
          <div className="avatar-swatches" ref={swatchesRef}>
            <SwatchButton value="" label="默认头像（名字首字母）" active={!current}>
              <span className="avatar-swatch-text">默认</span>
            </SwatchButton>
            {AVATAR_PRESETS.map((p) => (
              <SwatchButton
                key={p.key}
                value={p.url}
                label={p.label}
                active={current === p.url}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.label} />
              </SwatchButton>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}

export function ProfileForm({ user }: { user: User }) {
  const [state, action] = useActionState<FormState, FormData>(updateProfileAction, {});

  return (
    <form action={action} className="card card-pad">
      <h2 className="aside-title" style={{ marginTop: 0 }}>
        基本资料
      </h2>
      <Alert state={state} />
      <div className="field">
        <label className="label" htmlFor="nickname">
          昵称
        </label>
        <input
          className="input"
          id="nickname"
          name="nickname"
          defaultValue={user.nickname}
          maxLength={50}
        />
        <div className="hint">昵称留空时按用户名显示。头像在上方「头像」面板里换，改完即时保存。</div>
      </div>
      <div className="field">
        <label className="label" htmlFor="bio">
          个人简介
        </label>
        <textarea
          className="textarea"
          id="bio"
          name="bio"
          defaultValue={user.bio}
          maxLength={500}
          rows={3}
        />
      </div>
      <SubmitButton label="保存资料" />
    </form>
  );
}

export function PasswordForm({ hasPassword = true }: { hasPassword?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, {});

  return (
    <form action={action} className="card card-pad">
      <h2 className="aside-title" style={{ marginTop: 0 }}>
        {hasPassword ? "修改密码" : "设置密码"}
      </h2>
      <Alert state={state} />
      {hasPassword ? (
        <div className="field">
          <label className="label" htmlFor="oldPassword">
            当前密码
          </label>
          <input
            className="input"
            id="oldPassword"
            name="oldPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      ) : (
        <div className="hint" style={{ marginBottom: 12 }}>
          当前账号还没有密码，设置后可以用用户名或邮箱加密码登录。
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor="newPassword">
          新密码
        </label>
        <input
          className="input"
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="至少 8 位，含字母和数字"
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="confirm">
          确认新密码
        </label>
        <input
          className="input"
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>
      <SubmitButton label={hasPassword ? "修改密码" : "设置密码"} />
    </form>
  );
}

export function EmailForm({ user }: { user: User }) {
  const [state, action] = useActionState<FormState, FormData>(changeEmailAction, {});

  return (
    <form action={action} className="card card-pad">
      <h2 className="aside-title" style={{ marginTop: 0 }}>
        邮箱
      </h2>
      <Alert state={state} />
      <div className="field">
        <label className="label" htmlFor="email">
          当前邮箱
        </label>
        <input className="input" id="email-current" value={user.email} disabled />
        <div className="hint">
          {user.emailVerified ? "已验证" : "尚未验证"}。修改邮箱后需要重新验证新邮箱。
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="email-new">
          新邮箱
        </label>
        <input
          className="input"
          id="email-new"
          name="email"
          type="email"
          required
          placeholder="new@example.com"
        />
      </div>
      <SubmitButton label="发送验证邮件" />
    </form>
  );
}
