"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { reviewAction } from "@/lib/actions/admin-actions";
import { renderMarkdownSync } from "@/lib/markdown";
import type { FormState } from "@/lib/actions/types";
import type { Submission } from "@/lib/submissions";

function ReviewButtons({
  decisionRef,
}: {
  decisionRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { pending } = useFormStatus();
  // 注意：React 的 form action 不会把提交按钮的 name/value 带进 FormData，
  // 所以审核动作写在一个非受控的隐藏字段里，按钮点击时直接改 DOM 值。
  const decide = (value: string) => {
    if (decisionRef.current) decisionRef.current.value = value;
  };

  return (
    <div className="row" style={{ gap: 10, alignItems: "center" }}>
      <button
        type="submit"
        className="btn"
        disabled={pending}
        onClick={() => decide("approve")}
      >
        {pending ? "处理中…" : "通过并发布"}
      </button>
      <button
        type="submit"
        className="btn btn-outline"
        disabled={pending}
        style={{ color: "var(--red)", borderColor: "var(--red)" }}
        onClick={() => decide("reject")}
      >
        驳回
      </button>
    </div>
  );
}

function Item({
  sub,
  action,
}: {
  sub: Submission;
  action: (payload: FormData) => void;
}) {
  const [note, setNote] = useState("");
  const decisionRef = useRef<HTMLInputElement>(null);

  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <strong style={{ fontSize: 16 }}>{sub.title}</strong>
          <span className="badge" style={{ marginLeft: 8 }}>
            {sub.type === "site" ? "网址" : "文章"}
          </span>
          <span className="badge badge-accent" style={{ marginLeft: 6 }}>
            {sub.categoryName || "未分类"}
          </span>
        </div>
        <span className="text-muted text-sm nowrap">
          {sub.username} · {String(sub.createdAt).slice(0, 16)}
        </span>
      </div>

      {sub.url ? (
        <div style={{ marginBottom: 8 }}>
          <span className="text-muted text-sm">网址：</span>
          <a
            href={sub.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-accent"
            style={{ wordBreak: "break-all" }}
          >
            {sub.url}
          </a>
        </div>
      ) : null}

      {sub.description ? (
        <p className="text-muted" style={{ margin: "0 0 8px", fontSize: 14 }}>
          {sub.description}
        </p>
      ) : null}

      {sub.type === "article" && sub.contentMd ? (
        <details style={{ marginBottom: 10 }}>
          <summary className="text-muted text-sm" style={{ cursor: "pointer" }}>
            查看正文（Markdown）
          </summary>
          <div
            className="article-body card card-pad"
            style={{ marginTop: 10, maxHeight: 420, overflow: "auto" }}
            dangerouslySetInnerHTML={{ __html: renderMarkdownSync(sub.contentMd) }}
          />
        </details>
      ) : null}

      {sub.tags ? (
        <div style={{ marginBottom: 8 }}>
          <span className="text-muted text-sm">标签：</span>
          {sub.tags}
        </div>
      ) : null}

      <form action={action}>
        <input type="hidden" name="id" value={sub.id} />
        <input type="hidden" name="decision" defaultValue="" ref={decisionRef} />
        <div className="field" style={{ marginBottom: 10 }}>
          <label className="label" htmlFor={`note-${sub.id}`}>
            审核意见（驳回时必填，会随邮件一起发给作者）
          </label>
          <textarea
            className="textarea"
            id={`note-${sub.id}`}
            name="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="通过时可留空；驳回时请说明原因"
          />
        </div>
        <ReviewButtons decisionRef={decisionRef} />
      </form>
    </div>
  );
}

export default function ReviewQueue({ items }: { items: Submission[] }) {
  const [state, action] = useActionState<FormState, FormData>(reviewAction, {});

  return (
    <div>
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}

      {items.length === 0 ? (
        <div className="card card-pad">
          <div className="empty">
            <div className="empty-title">没有待审核的投稿</div>
            <div className="text-sm">新的投稿会出现在这里，审核通过后自动发布。</div>
          </div>
        </div>
      ) : (
        items.map((sub) => <Item key={sub.id} sub={sub} action={action} />)
      )}
    </div>
  );
}
