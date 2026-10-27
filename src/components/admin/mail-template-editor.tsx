"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAIL_SCENES,
  escapeMailHtml,
  fillMailTemplate,
  mailLayout,
  type MailScene,
} from "@/lib/mail-templates";

const FALLBACK_BASE = "https://example.com";

/** 预览里把 LOGO 转成绝对地址：邮件客户端只认绝对 URL */
function absoluteLogo(raw: string, base: string): string {
  const p = (raw || "/logo.png").trim();
  if (p.startsWith("//")) return `https:${p}`;
  if (/^https?:\/\//i.test(p)) return p;
  const b = (base || FALLBACK_BASE).replace(/\/+$/, "");
  return `${b}${p.startsWith("/") ? p : `/${p}`}`;
}

/** 预览用的示例占位符值；真实发送时由 mail.ts 替换成用户与站点数据 */
function sampleVars(
  scene: MailScene,
  base: string,
  siteName: string
): Record<string, string> {
  const url = (path: string) => `${base || FALLBACK_BASE}${path}`;
  const common = { site: escapeMailHtml(siteName), username: "示例用户" };

  switch (scene.key) {
    case "admin_reset":
      return {
        ...common,
        url: url("/reset-password?token=preview"),
        password_section: `<p style="margin:16px 0;padding:14px 16px;background:#f6f7f9;border-left:3px solid #2563eb;border-radius:6px">临时密码：<strong style="font-family:Consolas,Menlo,monospace;font-size:16px;letter-spacing:.6px;color:#111827">Ab3dEf7hJk9mNp</strong><br/><span style="color:#8a8f98;font-size:12.5px">建议登录后立即到「账号设置」修改。</span></p>`,
      };
    case "review":
      return {
        ...common,
        title: "我的第一篇投稿",
        status: "已通过审核",
        note_section: `<p style="margin:16px 0 0;padding:12px 14px;background:#f6f7f9;border-left:3px solid #16a34a;border-radius:6px;color:#374151">审核意见：内容完整，已推荐到首页。</p>`,
        url: url("/dashboard/submissions"),
      };
    case "site_reset":
      return {
        ...common,
        username: "站长",
        code: "123456",
        minutes: "10",
      };
    case "notify":
      return {
        ...common,
        title: "站点维护通知",
        body: "今晚 23:00 起进行约 30 分钟的维护，期间站点可能短暂无法访问。",
      };
    case "verify":
      return { ...common, url: url("/verify-email?token=preview") };
    default:
      return { ...common, url: url("/reset-password?token=preview") };
  }
}

function PreviewDialog({
  scene,
  subject,
  html,
  onClose,
}: {
  scene: MailScene;
  subject: string;
  html: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="mail-preview-mask"
      role="dialog"
      aria-modal="true"
      aria-label={`${scene.label} 邮件预览`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mail-preview-modal">
        <div className="mail-preview-head">
          <div>
            <strong>{scene.label} · 邮件预览</strong>
            <div className="hint" style={{ marginTop: 2 }}>
              占位符已用示例值填充，实际发送时会换成真实用户与链接。
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-outline" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="mail-preview-subject">
          <span>主题</span>
          <strong>{subject}</strong>
        </div>
        <iframe
          className="mail-preview-frame"
          title="邮件正文预览"
          sandbox=""
          srcDoc={html}
        />
      </div>
    </div>
  );
}

function SceneBlock({
  scene,
  settings,
  siteName,
  siteBase,
}: {
  scene: MailScene;
  settings: Record<string, string>;
  siteName: string;
  siteBase: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{
    subject: string;
    html: string;
  } | null>(null);

  const subjectKey = `mail_tpl_${scene.key}_subject`;
  const bodyKey = `mail_tpl_${scene.key}_body`;
  const placeholders = scene.placeholders
    .map((p) => `{{${p.name}}} ${p.desc}`)
    .join("；");

  /** 从 DOM 读当前值：表单是非受控的，用户可能刚改完还没保存 */
  const openPreview = () => {
    const box = boxRef.current;
    const subjectTpl =
      box?.querySelector<HTMLInputElement>(`[name="${subjectKey}"]`)?.value.trim() ||
      scene.defaultSubject;
    const bodyTpl =
      box?.querySelector<HTMLTextAreaElement>(`[name="${bodyKey}"]`)?.value.trim() ||
      scene.defaultBody;
    const vars = sampleVars(scene, siteBase, siteName);
    setPreview({
      subject: fillMailTemplate(subjectTpl, vars).replace(/\s+/g, " ").trim(),
      html: mailLayout(
        scene.title,
        fillMailTemplate(bodyTpl, vars),
        siteName,
        siteBase || FALLBACK_BASE,
        absoluteLogo(settings["logo_url"] || "", siteBase)
      ),
    });
  };

  return (
    <div className="mail-scene" ref={boxRef}>
      <div className="mail-scene-head">
        <div className="mail-scene-title">
          <strong>{scene.label}</strong>
          <span className="hint" style={{ marginTop: 2 }}>
            {scene.when}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={openPreview}
        >
          预览
        </button>
      </div>

      <div className="field">
        <label className="label" htmlFor={subjectKey}>
          邮件主题
        </label>
        <input
          id={subjectKey}
          name={subjectKey}
          className="input"
          defaultValue={settings[subjectKey] || scene.defaultSubject}
        />
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label className="label" htmlFor={bodyKey}>
          邮件正文
        </label>
        <textarea
          id={bodyKey}
          name={bodyKey}
          className="textarea textarea-mono"
          rows={9}
          defaultValue={settings[bodyKey] || scene.defaultBody}
        />
        <div className="hint">
          支持 HTML，可用占位符：{placeholders}。清空保存则恢复内置默认模版。
        </div>
      </div>

      {preview ? (
        <PreviewDialog
          scene={scene}
          subject={preview.subject}
          html={preview.html}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}

/** 邮件模版分组：按场景成块展示，每块带独立预览按钮 */
export default function MailTemplateEditor({
  settings,
  siteName,
  siteBase,
}: {
  settings: Record<string, string>;
  siteName: string;
  siteBase: string;
}) {
  return (
    <div>
      {MAIL_SCENES.map((scene) => (
        <SceneBlock
          key={scene.key}
          scene={scene}
          settings={settings}
          siteName={siteName}
          siteBase={siteBase}
        />
      ))}
    </div>
  );
}
