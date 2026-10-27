"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 第三方登录入口。
 *
 * - Telegram：官方登录组件脚本，onauth 回调把用户信息 POST 给
 *   /api/auth/telegram，服务端校验签名后写会话 Cookie。
 * - GitHub / Gitee / Google：普通跳转 /api/auth/<来源>，走 OAuth2 授权码流程。
 */

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramUser) => void;
  }
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

/** OAuth 来源的中文名，回调失败时用来拼提示 */
const OAUTH_PROVIDERS: Record<string, string> = {
  github: "GitHub",
  gitee: "Gitee",
  google: "Google",
};

const ERR_TEXT: Record<string, string> = {};
for (const [key, label] of Object.entries(OAUTH_PROVIDERS)) {
  ERR_TEXT[`${key}_disabled`] = `${label} 登录未开启`;
  ERR_TEXT[`${key}_not_configured`] = `${label} 登录尚未配置 Client ID / Secret`;
  ERR_TEXT[`${key}_denied`] = `你取消了 ${label} 授权`;
  ERR_TEXT[`${key}_no_code`] = `${label} 没有返回授权码`;
  ERR_TEXT[`${key}_bad_state`] = `${label} 登录状态校验失败，请重试`;
  ERR_TEXT[`${key}_token_failed`] = `${label} 令牌交换失败`;
  ERR_TEXT[`${key}_profile_failed`] = `获取 ${label} 用户信息失败`;
  ERR_TEXT[`${key}_login_failed`] = `${label} 登录失败，账号可能已被封禁`;
}

export default function SocialLogin({
  telegramBotName,
  githubEnabled,
  giteeEnabled,
  googleEnabled,
  error,
}: {
  telegramBotName: string;
  githubEnabled: boolean;
  giteeEnabled?: boolean;
  googleEnabled?: boolean;
  error?: string;
}) {
  const [msg, setMsg] = useState(error ? ERR_TEXT[error] ?? error : "");
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Telegram 组件
  useEffect(() => {
    if (!telegramBotName) return;

    window.onTelegramAuth = async (user: TelegramUser) => {
      setBusy(true);
      setMsg("");
      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });
        const data = (await res.json()) as {
          ok: boolean;
          error?: string;
          redirect?: string;
        };
        if (data.ok) {
          window.location.href = data.redirect || "/dashboard";
          return;
        }
        setMsg(data.error || "Telegram 登录失败");
      } catch {
        setMsg("网络错误，请稍后重试");
      } finally {
        setBusy(false);
      }
    };

    const scriptId = "telegram-widget-js";
    if (document.getElementById(scriptId)) return;

    // 官方组件脚本会把自己替换成 iframe，直接插入带 data-* 的 script 即可
    const s = document.createElement("script");
    s.id = scriptId;
    s.async = true;
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.setAttribute("data-telegram-login", telegramBotName);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "6");
    s.setAttribute("data-request-access", "write");
    s.setAttribute("data-userpic", "true");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");

    const host = wrapRef.current;
    if (host) {
      host.innerHTML = "";
      host.appendChild(s);
    } else {
      document.body.appendChild(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramBotName]);

  if (!telegramBotName && !githubEnabled && !giteeEnabled && !googleEnabled) {
    return null;
  }

  return (
    <div className="social-login">
      <div className="social-divider">
        <span>其他方式登录</span>
      </div>

      {msg ? <div className="alert alert-error">{msg}</div> : null}

      <div className="social-btns">
        {githubEnabled ? (
          <a className="btn btn-social btn-github" href="/api/auth/github">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.73.5.9 5.33.9 11.6c0 4.9 3.17 9.06 7.57 10.53.55.1.75-.24.75-.53v-1.9c-3.08.67-3.73-1.3-3.73-1.3-.5-1.28-1.23-1.62-1.23-1.62-1.01-.69.08-.68.08-.68 1.11.08 1.7 1.15 1.7 1.15.99 1.7 2.6 1.21 3.23.93.1-.72.39-1.21.7-1.49-2.46-.28-5.05-1.23-5.05-5.48 0-1.21.43-2.2 1.14-2.98-.11-.28-.5-1.41.11-2.94 0 0 .94-.3 3.08 1.14a10.7 10.7 0 0 1 5.6 0c2.13-1.44 3.07-1.14 3.07-1.14.61 1.53.23 2.66.12 2.94.71.78 1.13 1.77 1.13 2.98 0 4.26-2.6 5.2-5.07 5.47.4.35.76 1.03.76 2.08v3.08c0 .3.2.64.76.53a11.11 11.11 0 0 0 7.55-10.53C23.1 5.33 18.27.5 12 .5Z" />
            </svg>
            GitHub 登录
          </a>
        ) : null}

        {giteeEnabled ? (
          <a className="btn btn-social btn-gitee" href="/api/auth/gitee">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#c71d23" aria-hidden="true">
              <path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.15a.592.592 0 0 1-.592-.592v-1.482a.593.593 0 0 1 .593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 0 1-4 4H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.445-4.444h8.296Z" />
            </svg>
            Gitee 登录
          </a>
        ) : null}

        {googleEnabled ? (
          <a className="btn btn-social btn-google" href="/api/auth/google">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
              <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.29 9.14 5.38 12 5.38Z" />
            </svg>
            Google 登录
          </a>
        ) : null}

        {telegramBotName ? (
          <div className="social-tg" ref={wrapRef} aria-busy={busy} />
        ) : null}
      </div>
    </div>
  );
}
