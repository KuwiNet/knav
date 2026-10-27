// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  // 仅在 Next.js 运行时启用守卫；独立脚本(tsx)下允许直接导入
  require("server-only");
}
import nodemailer from "nodemailer";
import { execute, queryOne } from "./db";
import { getSettingMap } from "./settings";
import { resolveAssetUrl } from "./asset-url";
import { MAIL_SCENE_MAP, escapeMailHtml, fillMailTemplate, mailLayout, mailTemplateKeys } from "./mail-templates";

/**
 * 邮件发送服务。
 *
 * 配置来源优先级：
 *   1) 环境变量 SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
 *   2) knav_settings 表里后台配置的同名项（便于在管理界面改，不用重启服务）
 *
 * 未配置 SMTP 时，邮件不会真正发出，但会写入 knav_mail_log（status='failed'），
 * 并把邮件正文输出到服务端日志，保证本地开发能看到完整链路。
 *
 * 各场景的主题/正文来自「站点设置 → 邮件模版」，统一套用下面的 layout 外壳。
 */

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

async function setting(name: string): Promise<string> {
  const map = await getSettingMap();
  return map[name] ?? "";
}

export async function getMailConfig(): Promise<MailConfig> {
  const [host, port, user, pass, from, fromName] = await Promise.all([
    process.env.SMTP_HOST || setting("smtp_host"),
    process.env.SMTP_PORT || setting("smtp_port"),
    process.env.SMTP_USER || setting("smtp_user"),
    process.env.SMTP_PASS || setting("smtp_pass"),
    process.env.SMTP_FROM || setting("smtp_from"),
    process.env.SMTP_FROM_NAME || setting("smtp_from_name"),
  ]);

  const portNum = Number(port) || 465;
  return {
    host,
    port: portNum,
    // 465 是隐式 TLS，587 是 STARTTLS
    secure: portNum === 465,
    user,
    pass,
    from: from || user || "no-reply@localhost",
    fromName: fromName || "knav",
  };
}

let transporter: nodemailer.Transporter | null = null;
let transporterKey = "";

/** 取得（并缓存）邮件 transporter，配置变化时自动重建 */
async function getTransporter(): Promise<nodemailer.Transporter> {
  const cfg = await getMailConfig();
  const key = `${cfg.host}|${cfg.port}|${cfg.user}|${cfg.pass}|${cfg.from}`;
  if (transporter && transporterKey === key) return transporter;

  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  transporterKey = key;
  return transporter;
}

/** 发送邮件；失败不抛出，返回结果并记录日志 */
export async function sendMail(
  to: string,
  subject: string,
  html: string
): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getMailConfig();

  if (!cfg.host) {
    const msg = `SMTP 未配置，邮件未发送。收件人: ${to}，主题: ${subject}`;
    console.log("[mail:skipped]", msg);
    console.log("[mail:body]", html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300));
    await logMail(to, subject, html, "failed", "SMTP 未配置");
    return { ok: false, error: "SMTP 未配置" };
  }

  try {
    const tp = await getTransporter();
    await tp.sendMail({
      from: { name: cfg.fromName, address: cfg.from },
      to,
      subject,
      html,
    });
    await logMail(to, subject, html, "sent", "");
    return { ok: true };
  } catch (e: any) {
    const err = String(e?.message || e);
    console.error("[mail:failed]", to, subject, err);
    await logMail(to, subject, html, "failed", err.slice(0, 1000));
    return { ok: false, error: err };
  }
}

async function logMail(
  to: string,
  subject: string,
  body: string,
  status: "sent" | "failed",
  error: string
): Promise<void> {
  try {
    await execute(
      "INSERT INTO knav_mail_log (to_email, subject, body, status, error) VALUES (?,?,?,?,?)",
      [to, subject.slice(0, 200), body, status, error]
    );
  } catch {
    /* 日志写入失败不影响主流程 */
  }
}

/** 站点基础地址：优先后台「站点地址」，未配置时回退 SITE_URL 环境变量 */
export async function siteUrl(): Promise<string> {
  const fromDb = (await setting("site_url")).trim();
  if (fromDb) return fromDb.replace(/\/+$/, "");
  const fromEnv = (process.env.SITE_URL ?? "").trim();
  return (fromEnv || "http://localhost:3000").replace(/\/+$/, "");
}

/** 邮件顶部显示的名字，优先用简称 */
async function siteName(): Promise<string> {
  const map = await getSettingMap();
  return map["site_short_name"] || map["site_name"] || "knav";
}

/** 按场景取模版（未配置时用内置默认），填占位符并套外壳 */
async function renderMail(
  sceneKey: string,
  vars: Record<string, string>
): Promise<{ subject: string; html: string }> {
  const scene = MAIL_SCENE_MAP[sceneKey];
  const keys = mailTemplateKeys(sceneKey);
  const [map, base, name] = await Promise.all([
    getSettingMap(),
    siteUrl(),
    siteName(),
  ]);

  const all: Record<string, string> = { site: escapeMailHtml(name), ...vars };
  const subjectTpl = map[keys.subject] || scene.defaultSubject;
  const bodyTpl = map[keys.body] || scene.defaultBody;
  const subject = fillMailTemplate(subjectTpl, all).replace(/\s+/g, " ").trim();
  // 邮件里必须用绝对地址，客户端才能拉到站点 LOGO
  const logo = resolveAssetUrl(map["logo_url"] || "/logo.png", base);

  return {
    subject,
    html: mailLayout(scene.title, fillMailTemplate(bodyTpl, all), name, base, logo),
  };
}

/** 注册验证邮箱 */
export async function sendVerifyEmail(
  to: string,
  username: string,
  token: string
): Promise<{ ok: boolean; error?: string }> {
  const base = await siteUrl();
  const { subject, html } = await renderMail("verify", {
    username: escapeMailHtml(username),
    url: `${base}/verify-email?token=${encodeURIComponent(token)}`,
  });
  return sendMail(to, subject, html);
}

/** 投稿审核结果通知 */
export async function sendReviewResultMail(
  to: string,
  username: string,
  title: string,
  approved: boolean,
  note: string
): Promise<{ ok: boolean; error?: string }> {
  const base = await siteUrl();
  const noteSection = note
    ? `<p style="margin:16px 0 0;padding:12px 14px;background:#f6f7f9;border-left:3px solid ${
        approved ? "#16a34a" : "#dc2626"
      };border-radius:6px;color:#374151">审核意见：${escapeMailHtml(note)}</p>`
    : "";

  const { subject, html } = await renderMail("review", {
    username: escapeMailHtml(username),
    title: escapeMailHtml(title),
    status: approved ? "已通过审核" : "未通过审核",
    note_section: noteSection,
    url: `${base}/dashboard/submissions`,
  });
  return sendMail(to, subject, html);
}

/** 用户自助找回密码 */
export async function sendResetPasswordEmail(
  to: string,
  username: string,
  token: string
): Promise<{ ok: boolean; error?: string }> {
  const base = await siteUrl();
  const { subject, html } = await renderMail("reset", {
    username: escapeMailHtml(username),
    url: `${base}/reset-password?token=${encodeURIComponent(token)}`,
  });
  return sendMail(to, subject, html);
}

/**
 * 管理员重置密码通知。
 * 传了临时密码时，邮件里同时给出密码和设置链接，用户可二选一；
 * 只发链接时 password_section 为空，模版里那一行自然消失。
 */
export async function sendAdminResetPasswordEmail(
  to: string,
  username: string,
  token: string,
  temporaryPassword?: string
): Promise<{ ok: boolean; error?: string }> {
  const base = await siteUrl();
  const passwordSection = temporaryPassword
    ? `<p style="margin:16px 0;padding:14px 16px;background:#f6f7f9;border-left:3px solid #2563eb;border-radius:6px">临时密码：<strong style="font-family:Consolas,Menlo,monospace;font-size:16px;letter-spacing:.6px;color:#111827">${escapeMailHtml(
        temporaryPassword
      )}</strong><br/><span style="color:#8a8f98;font-size:12.5px">建议登录后立即到「账号设置」修改。</span></p>`
    : "";

  const { subject, html } = await renderMail("admin_reset", {
    username: escapeMailHtml(username),
    url: `${base}/reset-password?token=${encodeURIComponent(token)}`,
    password_section: passwordSection,
  });
  return sendMail(to, subject, html);
}

/** 站长执行站点重置前的邮箱验证码 */
export async function sendSiteResetCodeEmail(
  to: string,
  username: string,
  code: string,
  minutes: number
): Promise<{ ok: boolean; error?: string }> {
  const { subject, html } = await renderMail("site_reset", {
    username: escapeMailHtml(username),
    code: escapeMailHtml(code),
    minutes: String(minutes),
  });
  return sendMail(to, subject, html);
}

/** 通用通知（管理员给用户发通知时附带邮件，正文按纯文本处理） */
export async function sendNotifyMail(
  to: string,
  username: string,
  title: string,
  bodyText: string
): Promise<{ ok: boolean; error?: string }> {
  const { subject, html } = await renderMail("notify", {
    username: escapeMailHtml(username),
    title: escapeMailHtml(title),
    body: escapeMailHtml(bodyText).replace(/\r?\n/g, "<br/>"),
  });
  return sendMail(to, subject, html);
}
