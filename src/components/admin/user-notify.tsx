"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { notifyUserAction } from "@/lib/actions/admin-actions";
import type { FormState } from "@/lib/actions/types";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-sm" disabled={pending}>
      {pending ? "发送中…" : "发送通知"}
    </button>
  );
}

/** 给用户发站内通知 + 邮件，展开在用户行下方 */
export default function UserNotify({
  userId,
  username,
  onClose,
}: {
  userId: number;
  username: string;
  /** 收起面板 */
  onClose?: () => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(notifyUserAction, {});

  return (
    <form action={action} className="inline-panel">
      <input type="hidden" name="userId" value={userId} />
      <div className="inline-panel-head">
        <strong className="inline-panel-title">给 {username} 发通知</strong>
        <span className="spacer" />
        <span className="hint" style={{ margin: 0 }}>
          站内通知与邮件同时送达
        </span>
      </div>

      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}

      <div className="field" style={{ marginBottom: 0 }}>
        <label className="label">通知标题</label>
        <input
          className="input"
          name="title"
          maxLength={100}
          placeholder="如：账号安全提醒"
          required
        />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label className="label">通知内容</label>
        <textarea
          className="textarea"
          name="body"
          rows={4}
          maxLength={1000}
          placeholder="写清楚发生了什么、用户需要做什么"
          required
        />
      </div>

      <div className="inline-panel-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
          取消
        </button>
        <SendButton />
      </div>
    </form>
  );
}
