"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { completeSocialAction } from "@/lib/actions/social-actions";
import type { FormState } from "@/lib/actions/types";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function Alert({ state }: { state: FormState }) {
  if (state.error) return <div className="alert alert-error">{state.error}</div>;
  if (state.success) return <div className="alert alert-success">{state.success}</div>;
  return null;
}

/**
 * 第三方首次登录的两种落点：
 *   - 绑定本站已有账号：校验用户名 / 邮箱 + 密码，成功即登录
 *   - 用第三方资料新建账号：用户名、邮箱、昵称都可改，邮箱需本站验证
 */
export default function SocialCompleteForm({
  ticket,
  providerLabel,
  providerUsername,
  providerEmail,
  providerNickname,
  suggestedUsername,
  allowRegister,
}: {
  ticket: string;
  providerLabel: string;
  providerUsername: string;
  providerEmail: string;
  providerNickname: string;
  suggestedUsername: string;
  allowRegister: boolean;
}) {
  const [mode, setMode] = useState<"bind" | "create">("bind");
  // 受控输入：server action 返回错误时表单会被重置，
  // 不接管的话用户刚填的用户名 / 邮箱 / 昵称会全部丢失。
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState(suggestedUsername);
  const [email, setEmail] = useState(providerEmail);
  const [nickname, setNickname] = useState(providerNickname);
  const [state, action] = useActionState<FormState, FormData>(
    completeSocialAction,
    {}
  );

  if (state.success) {
    return (
      <div className="card card-pad">
        <div className="alert alert-success">{state.success}</div>
        <div className="hint" style={{ marginBottom: 16 }}>
          验证完成后回到登录页，继续用 {providerLabel} 登录即可。
          没收到邮件时可以在登录页或邮箱验证页重新发送。
        </div>
        <Link className="btn btn-block" href="/login">
          去登录
        </Link>
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button
          type="button"
          className={`btn btn-sm ${mode === "bind" ? "" : "btn-outline"}`}
          onClick={() => setMode("bind")}
        >
          绑定已有账号
        </button>
        {allowRegister ? (
          <button
            type="button"
            className={`btn btn-sm ${mode === "create" ? "" : "btn-outline"}`}
            onClick={() => setMode("create")}
          >
            创建新账号
          </button>
        ) : null}
      </div>

      <Alert state={state} />

      <form action={action}>
        <input type="hidden" name="ticket" value={ticket} />
        <input type="hidden" name="mode" value={mode} />

        {mode === "bind" ? (
          <>
            <div className="hint" style={{ marginBottom: 12 }}>
              用你在这个站点已有的账号登录一次，{providerLabel} 会自动绑定到该账号。
            </div>
            <div className="field">
              <label className="label" htmlFor="identifier">
                本站用户名或邮箱
              </label>
              <input
                className="input"
                id="identifier"
                name="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                required
                placeholder="用户名或邮箱"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="bind-password">
                本站账号密码
              </label>
              <input
                className="input"
                id="bind-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
              <div className="hint">
                如果你之前也是用第三方登录注册、没设过密码，请先用原来的方式登录，
                再到「账号设置」里设置密码或直接绑定。
              </div>
            </div>
            <SubmitButton label="登录并绑定" pendingLabel="绑定中…" />
          </>
        ) : (
          <>
            <div className="hint" style={{ marginBottom: 12 }}>
              以下资料读取自 {providerLabel}，可以修改。邮箱必须完成本站验证后才能登录。
              {providerUsername ? ` 第三方用户名：${providerUsername}` : ""}
            </div>
            <div className="field">
              <label className="label" htmlFor="username">
                用户名
              </label>
              <input
                className="input"
                id="username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                maxLength={30}
                autoComplete="username"
                required
                placeholder="字母、数字或下划线，3-30 位"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="email">
                邮箱
              </label>
              <input
                className="input"
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                placeholder="用于接收验证与审核通知"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="nickname">
                昵称
              </label>
              <input
                className="input"
                id="nickname"
                name="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={50}
                placeholder="留空时按用户名显示"
              />
            </div>
            <SubmitButton label="创建账号并发送验证邮件" pendingLabel="创建中…" />
          </>
        )}
      </form>
    </div>
  );
}
