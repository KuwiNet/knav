"use client";

import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  executeSiteResetAction,
  sendSiteResetCodeAction,
} from "@/lib/actions/admin-actions";
import type { FormState } from "@/lib/actions/types";
import { RESET_SCOPES, RESET_SCOPE_KEYS } from "@/lib/site-reset-config";

export default function SiteResetPanel({ email }: { email: string }) {
  const [picked, setPicked] = useState<string[]>(RESET_SCOPE_KEYS);
  const [codeState, sendCode, sending] = useActionState<FormState, FormData>(
    sendSiteResetCodeAction,
    {}
  );
  const [resetState, resetAction, resetting] = useActionState<
    FormState,
    FormData
  >(executeSiteResetAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  const allChecked = picked.length === RESET_SCOPES.length;
  const toggle = (key: string) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  /**
   * 不用 <form action> 原生提交：React 在 action 完成后会自动 form.reset()，
   * 把勾选框恢复成首次渲染时的「全选」，用户改过的清空范围会被悄悄改回去。
   * 这里自己阻止默认提交，再把 FormData 交给 action，DOM 状态就保持不变。
   */
  const submitReset = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    startTransition(() => resetAction(fd));
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="danger-zone">
        <div className="danger-zone-head">
          <strong>危险操作</strong>
          <span className="badge badge-red">不可撤销</span>
        </div>
        <p className="hint" style={{ margin: "6px 0 0" }}>
          清空前请自行备份数据库与 public/uploads。站长账号、站长的收藏与通知、当前登录会话始终保留；
          勾选「站点设置」会同时清掉 SMTP、站点名称、外观等配置，站点恢复默认值。
        </p>
      </div>

      <form ref={formRef} onSubmit={submitReset} className="card card-pad">
        <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h3 className="aside-title" style={{ margin: 0 }}>
            1. 选择要清空的数据
          </h3>
          <span className="spacer" />
          <button
            type="button"
            className="link-btn"
            onClick={() => setPicked(allChecked ? [] : RESET_SCOPE_KEYS)}
          >
            {allChecked ? "全不选" : "全选"}
          </button>
        </div>

        <div className="reset-scope-list">
          {RESET_SCOPES.map((s) => {
            const on = picked.includes(s.key);
            return (
              <label key={s.key} className={`reset-scope${on ? " is-on" : ""}`}>
                <input
                  type="checkbox"
                  name="scopes"
                  value={s.key}
                  checked={on}
                  onChange={() => toggle(s.key)}
                />
                <span>
                  <strong>{s.label}</strong>
                  <span className="hint">{s.hint}</span>
                </span>
              </label>
            );
          })}
        </div>

        <h3 className="aside-title" style={{ marginTop: 22 }}>
          2. 站长邮箱验证
        </h3>
        <div style={{ marginTop: 10 }}>
          <label className="label" htmlFor="site-reset-code">
            邮箱验证码
          </label>
          <div className="input-row">
            <input
              id="site-reset-code"
              className="input"
              name="code"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="6 位数字，10 分钟内有效"
            />
            <button
              type="button"
              className="btn btn-outline"
              disabled={sending || resetting}
              onClick={() => startTransition(() => sendCode(new FormData()))}
            >
              {sending ? "发送中…" : "发送验证码"}
            </button>
          </div>
          <div className="hint">
            验证码发送到 {email}；输错一次即作废，需要重新发送。
          </div>
        </div>

        {codeState.error ? (
          <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>
            {codeState.error}
          </div>
        ) : null}
        {codeState.success ? (
          <div className="alert alert-success" style={{ marginTop: 12, marginBottom: 0 }}>
            {codeState.success}
          </div>
        ) : null}

        {resetState.error ? (
          <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>
            {resetState.error}
          </div>
        ) : null}
        {resetState.success ? (
          <div className="alert alert-success" style={{ marginTop: 12, marginBottom: 0 }}>
            {resetState.success}
          </div>
        ) : null}

        <div className="reset-actions">
          <span className="hint" style={{ margin: 0 }}>
            已选 {picked.length} / {RESET_SCOPES.length} 类数据
          </span>
          <span className="spacer" />
          <button
            type="submit"
            className="btn btn-danger"
            disabled={resetting || sending || picked.length === 0}
            onClick={(e) => {
              if (
                !confirm(
                  `确定清空所选的 ${picked.length} 类数据？\n此操作不可撤销，站长账号与当前登录会话会保留。`
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            {resetting ? "正在清空…" : "确认清空所选数据"}
          </button>
        </div>
      </form>
    </div>
  );
}
