"use client";

import { useActionState, useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { saveSettingsAction, testMailAction } from "@/lib/actions/admin-actions";
import type { FormState } from "@/lib/actions/types";
import {
  OAUTH_CALLBACK_PROVIDERS,
  SETTING_GROUPS,
  SETTINGS_FIELDS,
  type SettingField,
} from "@/lib/settings-config";
import MailTemplateEditor from "./mail-template-editor";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? "保存中…" : "保存设置"}
    </button>
  );
}

function TestButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-outline" disabled={pending}>
      {pending ? "发送中…" : "发送测试邮件"}
    </button>
  );
}

/** 开关：未勾选时也要提交 0，所以配一个隐藏域 */
function SwitchField({ field, value }: { field: SettingField; value: string }) {
  return (
    <div className="field">
      <label className="switch-row" htmlFor={field.key}>
        <input type="hidden" name={field.key} value="0" />
        <input
          type="checkbox"
          id={field.key}
          name={field.key}
          value="1"
          defaultChecked={value === "1"}
        />
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        <span className="switch-text">
          <span className="switch-label">{field.label}</span>
          {field.hint ? <span className="hint">{field.hint}</span> : null}
        </span>
      </label>
    </div>
  );
}

/** 多选组：勾选项拼成逗号分隔串存库（如壁纸要参与随机的分类编号） */
function CheckboxesField({ field, value }: { field: SettingField; value: string }) {
  const picked = new Set(
    value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  );
  return (
    <div className="field">
      <label className="label">{field.label}</label>
      <div className="check-grid">
        {(field.options ?? []).map((o) => (
          <label key={o.value} className="check-item">
            <input
              type="checkbox"
              name={field.key}
              value={o.value}
              defaultChecked={picked.has(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {field.hint ? <div className="hint">{field.hint}</div> : null}
    </div>
  );
}

/** 图标类字段：文本 + 预览 */
function MediaField({ field, value }: { field: SettingField; value: string }) {
  return (
    <div className="field">
      <label className="label" htmlFor={field.key}>
        {field.label}
      </label>
      <div className="media-field">
        <input
          id={field.key}
          name={field.key}
          className="input"
          defaultValue={value}
          placeholder={field.placeholder}
        />
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt={field.label}
            className="media-preview"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
      </div>
      {field.hint ? <div className="hint">{field.hint}</div> : null}
    </div>
  );
}

/**
 * 壁纸子项按来源显隐：选「小鸟壁纸」才出现频率与分类勾选，选「自定义图片」才出现地址。
 *
 * 隐藏的字段不渲染也就不会提交，而 saveSettingsAction 对没提交的 key 是直接跳过的，
 * 所以切走来源并不会把用户之前填的值清掉，切回来还在。
 */
function isWallpaperFieldVisible(field: SettingField, source: string): boolean {
  if (field.key === "wallpaper_refresh" || field.key === "wallpaper_cids") {
    return source === "xiaoniao";
  }
  if (field.key === "wallpaper_custom") {
    return source === "custom";
  }
  return true;
}

function Field({
  field,
  value,
  onSelect,
}: {
  field: SettingField;
  value: string;
  onSelect?: (key: string, value: string) => void;
}) {
  if (field.type === "switch") return <SwitchField field={field} value={value} />;
  if (field.type === "checkboxes")
    return <CheckboxesField field={field} value={value} />;

  const id = field.key;
  const hint = field.hint ? <div className="hint">{field.hint}</div> : null;

  if (field.type === "textarea") {
    return (
      <div className="field">
        <label className="label" htmlFor={id}>
          {field.label}
        </label>
        <textarea
          id={id}
          name={field.key}
          className="textarea textarea-mono"
          rows={field.rows ?? 4}
          defaultValue={value}
          placeholder={field.placeholder}
        />
        {hint}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="field">
        <label className="label" htmlFor={id}>
          {field.label}
        </label>
        <select
          id={id}
          name={field.key}
          className="input"
          defaultValue={value}
          onChange={onSelect ? (e) => onSelect(field.key, e.target.value) : undefined}
        >
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {hint}
      </div>
    );
  }

  if (field.type === "password") {
    return (
      <div className="field">
        <label className="label" htmlFor={id}>
          {field.label}
        </label>
        <input
          id={id}
          name={field.key}
          type="password"
          className="input"
          autoComplete="off"
          defaultValue={value}
          placeholder={field.placeholder}
        />
        {hint}
      </div>
    );
  }

  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {field.label}
      </label>
      <input
        id={id}
        name={field.key}
        type={field.type === "number" ? "number" : "text"}
        className="input"
        defaultValue={value}
        placeholder={field.placeholder}
      />
      {hint}
    </div>
  );
}

const MEDIA_KEYS = new Set(["logo_url", "favicon_url", "seo_og_image"]);

/**
 * OAuth 回调地址清单。
 *
 * 用户要把这一条粘进 GitHub / Gitee / Google 的应用后台，两边必须逐字一致，
 * 所以直接按站点地址算出来给复制，不要再让人自己拼域名。
 */
function CallbackList({ base }: { base: string }) {
  const [copied, setCopied] = useState("");
  /** 剪贴板被浏览器拒绝时，记下需要手动复制的那一条 */
  const [manual, setManual] = useState("");

  const copy = async (url: string, e: MouseEvent<HTMLButtonElement>) => {
    // await 之后 React 会把 e.currentTarget 置空，先同步拿到所在行
    const row = e.currentTarget.closest(".oauth-callback-row");
    try {
      await navigator.clipboard.writeText(url);
      setManual("");
      setCopied(url);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      // 非 https 或浏览器拒绝写剪贴板：直接选中地址，按 Ctrl+C 就能拿走
      const code = row?.querySelector("code");
      const sel = window.getSelection();
      if (code && sel) {
        const range = document.createRange();
        range.selectNodeContents(code);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      setManual(url);
    }
  };

  return (
    <div className="field" style={{ marginTop: 16 }}>
      <label className="label">OAuth 回调地址</label>
      {OAUTH_CALLBACK_PROVIDERS.map((p) => {
        const url = `${base}/api/auth/${p.key}/callback`;
        return (
          <div key={p.key} className="oauth-callback-row">
            <span className="oauth-callback-name">{p.label}</span>
            <code className="oauth-callback-url">{url}</code>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={(e) => copy(url, e)}
            >
              {copied === url ? "已复制" : "复制"}
            </button>
            {manual === url ? (
              <span className="hint">地址已选中，按 Ctrl+C 复制。</span>
            ) : null}
          </div>
        );
      })}
      <div className="hint">
        到对应开放平台后台的以下位置粘贴这一条：
        {OAUTH_CALLBACK_PROVIDERS.map((p) => `${p.label}：${p.where}`).join(" ／ ")}
        。地址由「基础信息 → 站点地址」拼出，改了站点地址要回到来源后台同步，否则登录会报 redirect_uri 不匹配。
      </div>
      {!base ? (
        <div className="hint">
          站点地址还没填，上面显示的是相对路径。实际登录时会退回用当前访问的域名，请先去「基础信息」把站点地址填全。
        </div>
      ) : null}
    </div>
  );
}

export default function SettingsForm({
  settings,
  wallpaperUrl,
  siteBase,
  activeTab,
}: {
  settings: Record<string, string>;
  wallpaperUrl: string;
  /** 站点地址（已去末尾斜杠），用于拼 OAuth 回调地址 */
  siteBase: string;
  activeTab: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    saveSettingsAction,
    {}
  );
  const [mailState, mailAction] = useActionState<FormState, FormData>(
    testMailAction,
    {}
  );
  // 保存成功后重挂表单，让字段显示数据库里的最新值（保存是否生效一目了然）
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (state.success) setVersion((v) => v + 1);
  }, [state]);

  const groupDef = SETTING_GROUPS.find((g) => g.key === activeTab);
  const group = groupDef?.key ?? "basic";
  const fields = SETTINGS_FIELDS.filter((f) => f.group === group);
  const value = (key: string) => settings[key] ?? "";

  // 壁纸来源要驱动子项显隐，select 是非受控的，这里单独跟一下当前值
  const [wallSource, setWallSource] = useState(settings["wallpaper_source"] ?? "none");
  useEffect(() => {
    setWallSource(settings["wallpaper_source"] ?? "none");
  }, [settings["wallpaper_source"]]);
  const visibleFields = fields.filter((f) => isWallpaperFieldVisible(f, wallSource));

  // 表单是「非受控」的（defaultValue），所以只有重新挂载才会显示最新值。
  // 把当前分组的实际值拼进 key：保存后数据库值变了 → key 变 → 表单重挂，
  // 界面立刻反映保存结果，不会出现"保存后又变回原样"。
  const valueStamp = fields.map((f) => `${f.key}=${value(f.key)}`).join("|");

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="admin-tabs">
        {SETTING_GROUPS.map((g) => (
          <a
            key={g.key}
            href={`/admin/settings?tab=${g.key}`}
            className={`admin-tab${g.key === group ? " active" : ""}`}
          >
            {g.label}
          </a>
        ))}
      </div>

      <form key={`${group}-${version}-${valueStamp}`} action={action} className="card card-pad">
        <input type="hidden" name="group" value={group} />
        <h2 className="aside-title" style={{ marginTop: 0 }}>
          {groupDef?.label ?? "设置"}
        </h2>
        {groupDef?.hint ? (
          <p className="hint" style={{ marginTop: -4 }}>
            {groupDef.hint}
          </p>
        ) : null}

        {state.error ? <div className="alert alert-error">{state.error}</div> : null}
        {state.success ? (
          <div className="alert alert-success">{state.success}</div>
        ) : null}

        {group === "mail_tpl" ? (
          <MailTemplateEditor
            settings={settings}
            siteName={
              settings["site_short_name"] || settings["site_name"] || "knav"
            }
            siteBase={siteBase}
          />
        ) : visibleFields.length === 0 ? (
          <div className="empty">该分组暂无设置项</div>
        ) : (
          visibleFields.map((f) =>
            MEDIA_KEYS.has(f.key) ? (
              <MediaField key={f.key} field={f} value={value(f.key)} />
            ) : (
              <Field
                key={f.key}
                field={f}
                value={value(f.key)}
                onSelect={
                  f.key === "wallpaper_source"
                    ? (_key, next) => setWallSource(next)
                    : undefined
                }
              />
            )
          )
        )}

        {group === "login" ? <CallbackList base={siteBase} /> : null}

        {group === "wallpaper" && wallpaperUrl ? (
          <div className="field">
            <label className="label">当前壁纸预览</label>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={wallpaperUrl}
              alt="当前壁纸预览"
              className="wallpaper-preview"
            />
          </div>
        ) : null}

        {group === "logo" ? (
          <div className="hint mt-2">
            上传图片请到「素材库」，复制地址粘贴到上面即可。修改后刷新前台即可看到。
          </div>
        ) : null}

        <div style={{ marginTop: 14 }}>
          <SaveButton />
        </div>
      </form>

      {group === "mail" ? (
        <form action={mailAction} className="card card-pad">
          <h2 className="aside-title" style={{ marginTop: 0 }}>
            发送测试邮件
          </h2>
          {mailState.error ? (
            <div className="alert alert-error">{mailState.error}</div>
          ) : null}
          {mailState.success ? (
            <div className="alert alert-success">{mailState.success}</div>
          ) : null}
          <div style={{ marginTop: 10 }}>
            <label className="label" htmlFor="to">
              收件地址
            </label>
            <div className="input-row">
              <input className="input" id="to" name="to" type="email" required />
              <TestButton />
            </div>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            发送前请先保存上面的 SMTP 配置。
          </div>
        </form>
      ) : null}
    </div>
  );
}
