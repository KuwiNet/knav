/**
 * 邮件模版场景定义（纯数据，客户端安全）。
 *
 * 后台「邮件模版」分组按这里的场景生成主题/正文输入框，
 * 发送时由 mail.ts 用真实的 {{占位符}} 值替换后再套统一外壳。
 * 所有正文都支持 HTML；清空输入框会回退到这里的默认模版。
 */

export interface MailPlaceholder {
  name: string;
  desc: string;
}

export interface MailScene {
  key: string;
  /** 设置页里的场景名 */
  label: string;
  /** 邮件外壳顶部的大标题 */
  title: string;
  /** 这个场景什么时候发 */
  when: string;
  placeholders: MailPlaceholder[];
  defaultSubject: string;
  defaultBody: string;
}

/** 内联样式的行动按钮；{{url}} 会被替换成真实链接 */
function actionButton(text: string): string {
  return `<p style="margin:26px 0 0"><a href="{{url}}" style="display:inline-block;padding:11px 26px;background:#2563eb;border-radius:8px;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none">${text}</a></p>
<p style="margin:14px 0 0;color:#8a8f98;font-size:12.5px;line-height:1.7">按钮点不动时，把下面的链接复制到浏览器打开：<br/><span style="color:#2563eb;word-break:break-all">{{url}}</span></p>`;
}

export const MAIL_SCENES: MailScene[] = [
  {
    key: "verify",
    label: "验证邮箱",
    title: "验证你的邮箱地址",
    when: "注册后首次验证，或管理员修改了用户邮箱后重新验证。",
    placeholders: [
      { name: "site", desc: "站点名称" },
      { name: "username", desc: "用户名" },
      { name: "url", desc: "验证链接" },
    ],
    defaultSubject: "【{{site}}】验证你的邮箱地址",
    defaultBody: `<p style="margin:0 0 12px">你好 <strong>{{username}}</strong>：</p>
<p style="margin:0 0 12px">感谢注册 {{site}}。请点击下面的按钮完成邮箱验证，验证通过后即可投稿、收藏并接收审核通知。</p>
${actionButton("验证邮箱")}
<p style="margin:22px 0 0;color:#8a8f98;font-size:12.5px;line-height:1.7">链接 24 小时内有效。如果这不是你本人的操作，请忽略此邮件。</p>`,
  },
  {
    key: "reset",
    label: "自助找回密码",
    title: "重置你的密码",
    when: "用户在登录页点「忘记密码」时发送。",
    placeholders: [
      { name: "site", desc: "站点名称" },
      { name: "username", desc: "用户名" },
      { name: "url", desc: "设置新密码链接" },
    ],
    defaultSubject: "【{{site}}】重置你的密码",
    defaultBody: `<p style="margin:0 0 12px">你好 <strong>{{username}}</strong>：</p>
<p style="margin:0 0 12px">我们收到了重置你密码的请求。点击下方按钮设置新密码，链接 1 小时内有效，且只能使用一次。</p>
${actionButton("设置新密码")}
<p style="margin:22px 0 0;color:#8a8f98;font-size:12.5px;line-height:1.7">如果这不是你本人的操作，请忽略此邮件，你的密码不会被更改。</p>`,
  },
  {
    key: "admin_reset",
    label: "管理员重置密码",
    title: "密码已被管理员重置",
    when: "管理员在用户管理里重置密码时发送。设置临时密码后，邮件里会同时给出临时密码和重设链接。",
    placeholders: [
      { name: "site", desc: "站点名称" },
      { name: "username", desc: "用户名" },
      { name: "url", desc: "设置新密码链接" },
      { name: "password_section", desc: "临时密码区块；管理员只发链接时为空" },
    ],
    defaultSubject: "【{{site}}】管理员重置了你的密码",
    defaultBody: `<p style="margin:0 0 12px">你好 <strong>{{username}}</strong>：</p>
<p style="margin:0 0 12px">管理员重置了你的账号密码。</p>
{{password_section}}
<p style="margin:0 0 12px">你也可以点击下方按钮自己设置新密码（24 小时内有效，只能使用一次）。</p>
${actionButton("设置新密码")}
<p style="margin:22px 0 0;color:#8a8f98;font-size:12.5px;line-height:1.7">如果这不是你本人的操作，请尽快联系站点管理员。</p>`,
  },
  {
    key: "review",
    label: "投稿审核结果",
    title: "投稿审核结果",
    when: "管理员通过或驳回一条投稿后发送给作者。",
    placeholders: [
      { name: "site", desc: "站点名称" },
      { name: "username", desc: "用户名" },
      { name: "title", desc: "投稿标题" },
      { name: "status", desc: "审核结果：已通过审核 / 未通过审核" },
      { name: "note_section", desc: "审核意见区块；没有填写意见时为空" },
      { name: "url", desc: "我的投稿链接" },
    ],
    defaultSubject: "【{{site}}】你的投稿{{status}}",
    defaultBody: `<p style="margin:0 0 12px">你好 <strong>{{username}}</strong>：</p>
<p style="margin:0 0 12px">你投稿的《<strong>{{title}}</strong>》{{status}}。</p>
{{note_section}}
<p style="margin:0">你可以在「我的投稿」里查看处理进度和已发布的内容。</p>
${actionButton("查看我的投稿")}`,
  },
  {
    key: "site_reset",
    label: "站长重置验证码",
    title: "站点重置验证码",
    when: "站长在「站点重置」页清空站点数据前，系统会往站长邮箱发送验证码。",
    placeholders: [
      { name: "site", desc: "站点名称" },
      { name: "username", desc: "站长用户名" },
      { name: "code", desc: "6 位数字验证码" },
      { name: "minutes", desc: "有效期（分钟）" },
    ],
    defaultSubject: "【{{site}}】站点重置验证码",
    defaultBody: `<p style="margin:0 0 12px">你好 <strong>{{username}}</strong>：</p>
<p style="margin:0 0 12px">有人请求清空站点数据。如果这是你本人的操作，请回到后台「站点重置」页，输入下面的验证码：</p>
<p style="margin:20px 0;padding:16px;background:#f6f7f9;border:1px solid #e8eaed;border-radius:8px;text-align:center;font-family:Consolas,Menlo,monospace;font-size:26px;font-weight:700;letter-spacing:8px;color:#111827">{{code}}</p>
<p style="margin:0;color:#8a8f98;font-size:12.5px;line-height:1.7">验证码 {{minutes}} 分钟内有效，只能使用一次；输错一次即作废，需要重新发送。如果这不是你本人的操作，请立即修改密码并检查登录设备。</p>`,
  },
  {
    key: "notify",
    label: "管理员通知",
    title: "站点通知",
    when: "管理员在用户管理里给某个用户发通知时，随站内信一起发送。",
    placeholders: [
      { name: "site", desc: "站点名称" },
      { name: "username", desc: "用户名" },
      { name: "title", desc: "通知标题" },
      { name: "body", desc: "通知正文（纯文本，换行会保留）" },
    ],
    defaultSubject: "【{{site}}】{{title}}",
    defaultBody: `<p style="margin:0 0 12px">你好 <strong>{{username}}</strong>：</p>
<div style="margin:0;padding:14px 16px;background:#f6f7f9;border-radius:8px;line-height:1.8">{{body}}</div>
<p style="margin:22px 0 0;color:#8a8f98;font-size:12.5px">你也可以登录站点，在「通知」里查看这条消息。</p>`,
  },
];

export const MAIL_SCENE_MAP: Record<string, MailScene> = Object.fromEntries(
  MAIL_SCENES.map((s) => [s.key, s])
);

/** 主题/正文在 knav_settings 里的键名 */
export function mailTemplateKeys(scene: string): { subject: string; body: string } {
  return {
    subject: `mail_tpl_${scene}_subject`,
    body: `mail_tpl_${scene}_body`,
  };
}

/** HTML 转义（服务端发送与后台预览共用） */
export function escapeMailHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 把 {{key}} 换成真实值；未知占位符替换为空 */
export function fillMailTemplate(
  tpl: string,
  vars: Record<string, string>
): string {
  return tpl.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

/** 统一邮件外壳：站点 LOGO + 名称 + 场景标题 + 正文 + 页脚 */
export function mailLayout(
  title: string,
  bodyHtml: string,
  name: string,
  base: string,
  logoUrl?: string
): string {
  const brand = escapeMailHtml(name);
  const link = escapeMailHtml(base);
  const logo = escapeMailHtml((logoUrl ?? "").trim());
  const logoCell = logo
    ? `<td style="padding-right:10px;vertical-align:middle"><img src="${logo}" alt="${brand}" width="34" height="34" style="display:block;width:34px;height:34px;border:0;border-radius:9px;outline:none;text-decoration:none" /></td>`
    : "";

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f4f5f7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;padding:34px 14px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e8eaed;border-radius:14px;overflow:hidden">
        <tr><td style="height:4px;background:#2563eb;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:24px 32px 0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            ${logoCell}
            <td style="vertical-align:middle;font-size:15px;font-weight:600;color:#111827;letter-spacing:.01em">${brand}</td>
          </tr></table>
          <div style="margin-top:16px;font-size:21px;font-weight:650;color:#111827;line-height:1.35">${escapeMailHtml(title)}</div>
        </td></tr>
        <tr><td style="padding:18px 32px 30px;color:#374151;font-size:14px;line-height:1.85;word-break:break-word">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafbfc;border-top:1px solid #eef0f3;color:#9ca3af;font-size:12px;line-height:1.7">
          ${brand}${base ? ` · <a href="${link}" style="color:#9ca3af;text-decoration:none">${link}</a>` : ""}<br/>
          此邮件由系统自动发送，请勿直接回复。
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
