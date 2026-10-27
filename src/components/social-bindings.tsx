"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { unbindSocialAction } from "@/lib/actions/social-actions";
import type { FormState } from "@/lib/actions/types";

interface Binding {
  provider: string;
  username: string;
  email: string;
}

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: number;
  hash: string;
}

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramUser) => void;
  }
}

const PROVIDERS: { key: string; label: string }[] = [
  { key: "telegram", label: "Telegram" },
  { key: "github", label: "GitHub" },
  { key: "gitee", label: "Gitee" },
  { key: "google", label: "Google" },
];

function UnbindButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-sm btn-outline" disabled={pending}>
      {pending ? "解绑中…" : "解绑"}
    </button>
  );
}

/**
 * 第三方账号绑定管理。
 *
 * 已绑定的平台始终显示（哪怕后台后来关掉了该登录方式），方便用户解绑；
 * 未绑定的平台只在后台开启后才出现绑定入口。
 */
export default function SocialBindings({
  bindings,
  enabled,
  configured,
  telegramBotName,
  notice,
  error,
}: {
  bindings: Binding[];
  enabled: Record<string, boolean>;
  configured: Record<string, boolean>;
  telegramBotName: string;
  notice?: string;
  error?: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(unbindSocialAction, {});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const tgRef = useRef<HTMLDivElement | null>(null);

  const bound = new Map(bindings.map((b) => [b.provider, b]));
  const canBindTelegram =
    enabled.telegram && configured.telegram && !bound.has("telegram");

  useEffect(() => {
    if (!canBindTelegram) return;

    window.onTelegramAuth = async (user: TelegramUser) => {
      setBusy(true);
      setMsg("");
      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...user, intent: "bind" }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (data.ok) {
          window.location.href = "/dashboard/profile?social=bound&provider=telegram";
          return;
        }
        setMsg(data.error || "绑定失败");
      } catch {
        setMsg("网络错误，请稍后重试");
      } finally {
        setBusy(false);
      }
    };

    const scriptId = "telegram-widget-js";
    if (document.getElementById(scriptId)) return;
    const s = document.createElement("script");
    s.id = scriptId;
    s.async = true;
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.setAttribute("data-telegram-login", telegramBotName);
    s.setAttribute("data-size", "medium");
    s.setAttribute("data-radius", "6");
    s.setAttribute("data-request-access", "write");
    s.setAttribute("data-userpic", "false");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");

    const host = tgRef.current;
    if (host) {
      host.innerHTML = "";
      host.appendChild(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canBindTelegram, telegramBotName]);

  return (
    <div className="card card-pad">
      <h2 className="aside-title" style={{ marginTop: 0 }}>
        第三方账号
      </h2>
      <div className="hint" style={{ marginBottom: 12 }}>
        绑定后可以直接用这些平台登录本站。解绑前请确认已经设置密码或绑定了其他平台，
        避免账号无法登录。
      </div>

      {notice ? <div className="alert alert-success">{notice}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {msg ? <div className="alert alert-error">{msg}</div> : null}
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}

      <div className="binding-list">
        {PROVIDERS.map(({ key, label }) => {
          const item = bound.get(key);
          const canBind = enabled[key] && configured[key];
          const reason = !enabled[key]
            ? "后台未开启"
            : key === "telegram"
              ? "后台缺少 Bot 用户名"
              : "后台缺少 Client ID / Secret";

          return (
            <div className="binding-row" key={key}>
              <div className="binding-main">
                <div className="strong">{label}</div>
                <div className="hint">
                  {item
                    ? item.username
                      ? `已绑定：${item.username}${item.email ? ` · ${item.email}` : ""}`
                      : `已绑定${item.email ? `：${item.email}` : ""}`
                    : "未绑定"}
                </div>
              </div>

              {item ? (
                <form
                  action={action}
                  onSubmit={(e) => {
                    if (!window.confirm(`确定要解绑 ${label} 吗？`)) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="provider" value={key} />
                  <UnbindButton />
                </form>
              ) : canBind ? (
                key === "telegram" ? (
                  <div ref={tgRef} className="social-tg" aria-busy={busy} />
                ) : (
                  <a
                    className="btn btn-sm"
                    href={`/api/auth/${key}?intent=bind`}
                  >
                    绑定
                  </a>
                )
              ) : (
                <span className="hint">{reason}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
