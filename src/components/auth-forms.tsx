"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  loginAction,
  registerAction,
  forgotPasswordAction,
  resetPasswordAction,
  resendVerifyAction,
} from "@/lib/actions/auth-actions";
import type { FormState } from "@/lib/actions/types";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-block" disabled={pending}>
      {pending ? "处理中…" : label}
    </button>
  );
}

function Alert({ state }: { state: FormState }) {
  if (state.error) return <div className="alert alert-error">{state.error}</div>;
  if (state.success) return <div className="alert alert-success">{state.success}</div>;
  return null;
}

/* ---------------------------------------------------------------- 登录 */

export function LoginForm({ allowRegister = true }: { allowRegister?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});

  return (
    <form action={action} className="card card-pad">
      <Alert state={state} />
      <div className="field">
        <label className="label" htmlFor="identifier">
          用户名或邮箱
        </label>
        <input
          className="input"
          id="identifier"
          name="identifier"
          autoComplete="username"
          required
          placeholder="请输入用户名或邮箱"
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">
          密码
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="请输入密码"
        />
      </div>
      <SubmitButton label="登录" />
      <div className="auth-foot">
        <Link href="/forgot-password">忘记密码？</Link>
        {allowRegister ? (
          <span className="hint" style={{ marginLeft: 12 }}>
            还没有账号？<Link href="/register">立即注册</Link>
          </span>
        ) : null}
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- 注册 */

export function RegisterForm() {
  const [state, action] = useActionState<FormState, FormData>(registerAction, {});

  if (state.success) {
    return (
      <div className="card card-pad">
        <div className="alert alert-success">{state.success}</div>
        <div className="hint" style={{ marginBottom: 16 }}>
          提示：本地开发环境如果没有配置 SMTP，邮件不会真正发出，
          可以到后台「邮件日志」查看完整内容与验证链接。
        </div>
        <Link className="btn btn-block" href="/login">
          返回登录
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="card card-pad">
      <Alert state={state} />
      <div className="field">
        <label className="label" htmlFor="username">
          用户名
        </label>
        <input
          className="input"
          id="username"
          name="username"
          autoComplete="username"
          required
          minLength={3}
          maxLength={30}
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
          autoComplete="email"
          required
          placeholder="用于接收验证与审核通知"
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">
          密码
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="至少 8 位，含字母和数字"
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="confirm">
          确认密码
        </label>
        <input
          className="input"
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="再次输入密码"
        />
      </div>
      <SubmitButton label="注册并发送验证邮件" />
      <div className="auth-foot">
        已有账号？<Link href="/login">直接登录</Link>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- 找回密码 */

export function ForgotPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(
    forgotPasswordAction,
    {}
  );

  return (
    <form action={action} className="card card-pad">
      <Alert state={state} />
      <div className="field">
        <label className="label" htmlFor="identifier">
          用户名或邮箱
        </label>
        <input
          className="input"
          id="identifier"
          name="identifier"
          required
          placeholder="填写注册时使用的用户名或邮箱"
        />
      </div>
      <SubmitButton label="发送重置邮件" />
      <div className="auth-foot">
        <Link href="/login">返回登录</Link>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- 重置密码 */

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(
    resetPasswordAction,
    {}
  );

  if (state.success) {
    return (
      <div className="card card-pad">
        <div className="alert alert-success">{state.success}</div>
        <Link className="btn btn-block" href="/login">
          去登录
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="card card-pad">
      <Alert state={state} />
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label className="label" htmlFor="password">
          新密码
        </label>
        <input
          className="input"
          id="password"
          name="password"
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
      <SubmitButton label="重置密码" />
    </form>
  );
}

/* ---------------------------------------------------------------- 重发验证邮件 */

export function ResendVerifyForm() {
  const [state, action] = useActionState<FormState, FormData>(
    resendVerifyAction,
    {}
  );

  return (
    <form action={action} className="card card-pad">
      <Alert state={state} />
      <div className="field">
        <label className="label" htmlFor="email">
          注册邮箱
        </label>
        <input
          className="input"
          id="email"
          name="email"
          type="email"
          required
          placeholder="填写注册时使用的邮箱"
        />
      </div>
      <SubmitButton label="重新发送验证邮件" />
      <div className="auth-foot">
        <Link href="/login">返回登录</Link>
      </div>
    </form>
  );
}
