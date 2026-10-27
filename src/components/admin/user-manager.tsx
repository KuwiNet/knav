"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createUserAction,
  updateUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  setUserStatusAction,
  transferOwnerAction,
  adminUnbindIdentityAction,
} from "@/lib/actions/admin-actions";
import type { FormState } from "@/lib/actions/types";
import type { UserActivity } from "@/lib/admin-manage";
import Avatar from "@/components/avatar";
import UserNotify from "@/components/admin/user-notify";

export interface AdminUserRow {
  id: number;
  username: string;
  email: string;
  nickname: string;
  avatar: string;
  bio: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface UserIdentityInfo {
  provider: string;
  username: string;
  email: string;
}

const IDENTITY_PROVIDERS: { key: string; label: string; short: string }[] = [
  { key: "telegram", label: "Telegram", short: "TG" },
  { key: "github", label: "GitHub", short: "GitHub" },
  { key: "gitee", label: "Gitee", short: "Gitee" },
  { key: "google", label: "Google", short: "Google" },
];

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  active: { label: "正常", cls: "badge badge-green" },
  pending: { label: "待验证", cls: "badge badge-amber" },
  banned: { label: "已封禁", cls: "badge badge-red" },
};

const ROLE_MAP: Record<string, { label: string; cls: string }> = {
  owner: { label: "站长", cls: "badge badge-accent" },
  admin: { label: "管理员", cls: "badge badge-green" },
  editor: { label: "编辑", cls: "badge badge-amber" },
  user: { label: "用户", cls: "badge" },
};

function RoleBadge({ role }: { role: string }) {
  const item = ROLE_MAP[role] ?? ROLE_MAP.user;
  return <span className={item.cls}>{item.label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const item = STATUS_MAP[status] ?? STATUS_MAP.active;
  return <span className={item.cls}>{item.label}</span>;
}

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-sm" disabled={pending}>
      {pending ? "保存中…" : label}
    </button>
  );
}

function Msg({ state }: { state: FormState }) {
  if (state.error)
    return (
      <div className="alert alert-error" style={{ marginTop: 10, marginBottom: 0 }}>
        {state.error}
      </div>
    );
  if (state.success)
    return (
      <div className="alert alert-success" style={{ marginTop: 10, marginBottom: 0 }}>
        {state.success}
      </div>
    );
  return null;
}

function UserForm({
  mode,
  user,
  onSaved,
}: {
  mode: "create" | "edit";
  user?: AdminUserRow;
  /** 保存成功后回调（用来收起表单） */
  onSaved?: () => void;
}) {
  const action = mode === "create" ? createUserAction : updateUserAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  useEffect(() => {
    if (state.success) onSaved?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="card card-pad">
      {mode === "edit" ? <input type="hidden" name="id" value={user!.id} /> : null}
      <h3 className="aside-title" style={{ marginTop: 0 }}>
        {mode === "create" ? "新增用户" : `编辑用户：${user!.username}`}
      </h3>
      <Msg state={state} />

      <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        {mode === "create" ? (
          <div style={{ flex: 1, minWidth: 150 }}>
            <label className="label">用户名</label>
            <input className="input" name="username" required placeholder="登录名" />
          </div>
        ) : null}
        <div style={{ flex: 1, minWidth: 170 }}>
          <label className="label">邮箱</label>
          <input
            className="input"
            name="email"
            type="email"
            required
            defaultValue={user?.email ?? ""}
          />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label className="label">昵称</label>
          <input className="input" name="nickname" defaultValue={user?.nickname ?? ""} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label className="label">头像地址</label>
          <input className="input" name="avatar" defaultValue={user?.avatar ?? ""} />
        </div>
      </div>

      {mode === "create" ? (
        <div className="row" style={{ gap: 10, alignItems: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 170 }}>
            <label className="label">初始密码</label>
            <input
              className="input"
              name="password"
              type="password"
              required
              minLength={6}
              placeholder="至少 6 位"
            />
          </div>
          <div style={{ flex: 0, minWidth: 120 }}>
            <label className="label">角色</label>
            <select className="input" name="role" defaultValue="user">
              <option value="user">普通用户</option>
              <option value="editor">编辑</option>
              <option value="admin">管理员</option>
            </select>
          </div>
          <div style={{ flex: 0, minWidth: 120 }}>
            <label className="label">状态</label>
            <select className="input" name="status" defaultValue="active">
              <option value="active">正常</option>
              <option value="pending">待验证</option>
              <option value="banned">封禁</option>
            </select>
          </div>
        </div>
      ) : (
        <div className="row" style={{ gap: 10, alignItems: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
          {user?.role === "owner" ? (
            /* 站长身份不在这里改：角色/状态只读且不随表单提交 */
            <>
              <div style={{ flex: 0, minWidth: 120 }}>
                <label className="label">角色</label>
                <input className="input" defaultValue="站长" disabled />
              </div>
              <div style={{ flex: 0, minWidth: 120 }}>
                <label className="label">状态</label>
                <input className="input" defaultValue="正常" disabled />
              </div>
            </>
          ) : (
            <>
              <div style={{ flex: 0, minWidth: 120 }}>
                <label className="label">角色</label>
                <select className="input" name="role" defaultValue={user?.role ?? "user"}>
                  <option value="user">普通用户</option>
                  <option value="editor">编辑</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <div style={{ flex: 0, minWidth: 120 }}>
                <label className="label">状态</label>
                <select className="input" name="status" defaultValue={user?.status ?? "active"}>
                  <option value="active">正常</option>
                  <option value="pending">待验证</option>
                  <option value="banned">封禁</option>
                </select>
              </div>
            </>
          )}
        </div>
      )}

      <div className="field" style={{ marginTop: 10 }}>
        <label className="label">个人简介</label>
        <textarea
          className="textarea"
          name="bio"
          rows={2}
          defaultValue={user?.bio ?? ""}
        />
      </div>

      <div className="row" style={{ gap: 10, marginTop: 12 }}>
        <SaveButton label={mode === "create" ? "创建用户" : "保存修改"} />
      </div>

      {mode === "edit" ? (
        <div className="hint" style={{ marginTop: 10 }}>
          改动邮箱会清空验证状态、踢掉该用户的登录会话，并自动往新邮箱发验证邮件；
          对方要重新登录并点过链接才能用账号。
        </div>
      ) : null}

      {mode === "edit" && user?.role === "owner" ? (
        <div className="hint" style={{ marginTop: 6 }}>
          站长身份只能通过用户列表的「转移站长」变更；站长账号不能被封禁或删除。
        </div>
      ) : null}
    </form>
  );
}

/**
 * 重置密码表单（显示在操作弹窗里）。
 *
 * 两条路径：
 *   - 不填密码：只发「设置新密码」链接，当前密码不动，用户自己决定改不改；
 *   - 填了密码：立即把密码改成它并踢掉会话，邮件同时给临时密码和设置链接，
 *     用户可以直接用临时密码登录，也可以点链接自己重设。
 */
const PWD_POOL = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 去掉容易看错的字符（I O l 0 1），抄录和口头转达都不容易被念错 */
function randomPassword(len = 14): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += PWD_POOL[b % PWD_POOL.length];
  return out;
}

function ResetPasswordForm({
  user,
  onClose,
}: {
  user: AdminUserRow;
  onClose?: () => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    resetUserPasswordAction,
    {}
  );
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时不拦人：输入框里的字照样能选中复制
    }
  };

  return (
    <form action={action} className="inline-panel">
      <input type="hidden" name="id" value={user.id} />
      <div className="inline-panel-head">
        <strong className="inline-panel-title">重置 {user.username} 的密码</strong>
        <span className="spacer" />
        <span className="hint" style={{ margin: 0 }}>
          重置后该用户登录会话立即失效
        </span>
      </div>

      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? (
        <div className="alert alert-success">{state.success}</div>
      ) : null}

      <div className="field" style={{ marginBottom: 0 }}>
        <label className="label">新密码（可选，至少 8 位）</label>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            className="input"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            maxLength={72}
            autoComplete="off"
            placeholder="留空只发设置链接；填写则立即改成这个密码"
            style={{ flex: 1, minWidth: 220 }}
          />
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => setPassword(randomPassword())}
          >
            随机生成
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={copy}
            disabled={!password}
          >
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        <div className="hint">
          留空：只发「设置新密码」链接（24 小时内有效，一次性），当前密码不变。
          填写：密码立即改成这里的值、踢掉该用户所有登录会话，邮件会同时给出临时密码和设置链接，
          用户可直接用临时密码登录，也可以点链接自己重设。
        </div>
      </div>

      <div className="inline-panel-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
          取消
        </button>
        <SaveButton label="确定重置" />
      </div>
    </form>
  );
}

function AdminUnbindButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-sm btn-outline"
      style={{ color: "var(--red)", borderColor: "var(--red)" }}
      disabled={pending}
    >
      {pending ? "解绑中…" : "解绑"}
    </button>
  );
}

/** 后台查看 / 解绑某个用户的第三方账号 */
function BindingsPanel({
  user,
  identities,
  readOnly = false,
  onClose,
}: {
  user: AdminUserRow;
  identities: UserIdentityInfo[];
  readOnly?: boolean;
  onClose: () => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    adminUnbindIdentityAction,
    {}
  );
  const map = new Map(identities.map((i) => [i.provider, i]));

  return (
    <div className="inline-panel">
      <div className="inline-panel-head">
        <strong className="inline-panel-title">{user.username} 的第三方绑定</strong>
        <span className="spacer" />
        <span className="hint" style={{ margin: 0 }}>
          {readOnly ? "该账号的绑定只能由本人管理" : "解绑后该平台将无法登录这个账号"}
        </span>
      </div>

      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}

      <div className="binding-list">
        {IDENTITY_PROVIDERS.map(({ key, label }) => {
          const item = map.get(key);
          const info = item
            ? [item.username, item.email].filter(Boolean).join(" · ") || "已绑定"
            : "未绑定";
          return (
            <div className="binding-row" key={key}>
              <div className="binding-main">
                <span className="binding-name">{label}</span>
                <span className="binding-info" title={info}>
                  {info}
                </span>
              </div>
              {item && !readOnly ? (
                <form
                  action={action}
                  onSubmit={(e) => {
                    if (!confirm(`确定解绑 ${user.username} 的 ${label} 账号？`)) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="provider" value={key} />
                  <AdminUnbindButton />
                </form>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="inline-panel-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
}

type ActionView = "menu" | "edit" | "reset" | "notify" | "bindings";

export default function UserManager({
  users,
  status,
  keyword,
  activity,
  identities,
  viewerId,
  viewerRole,
}: {
  users: AdminUserRow[];
  status: string;
  keyword: string;
  /** 每个用户的通知数与收藏数（后台按当页批量取） */
  activity: Record<number, UserActivity>;
  /** 每个用户已绑定的第三方账号 */
  identities: Record<number, UserIdentityInfo[]>;
  /** 当前登录的后台用户：用来保护站长行、显示站长专属操作 */
  viewerId: number;
  viewerRole: string;
}) {
  const viewerIsOwner = viewerRole === "owner";
  const [creating, setCreating] = useState(false);
  const [openedId, setOpenedId] = useState<number | null>(null);
  const [view, setView] = useState<ActionView>("menu");

  const openedUser = openedId ? users.find((u) => u.id === openedId) ?? null : null;
  const openUser = (id: number) => {
    setOpenedId(id);
    setView("menu");
  };
  const closeModal = () => {
    setOpenedId(null);
    setView("menu");
  };

  useEffect(() => {
    if (!openedUser) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // closeModal 是稳定的状态更新，不需要进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedUser]);

  const tabs = [
    { key: "", label: "全部" },
    { key: "active", label: "正常" },
    { key: "pending", label: "待验证" },
    { key: "banned", label: "已封禁" },
  ];

  const openedAct = openedUser
    ? activity[openedUser.id] ?? { notifications: 0, unread: 0, favorites: 0 }
    : { notifications: 0, unread: 0, favorites: 0 };
  const openedIsOwner = openedUser?.role === "owner";
  const openedCanManage = openedUser ? !openedIsOwner || openedUser.id === viewerId : false;
  const openedIdentities = openedUser ? identities[openedUser.id] ?? [] : [];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <a
            key={t.key || "all"}
            href={t.key ? `/admin/users?status=${t.key}` : "/admin/users"}
            className={`btn btn-sm ${status === t.key ? "" : "btn-outline"}`}
          >
            {t.label}
          </a>
        ))}
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setCreating((v) => !v);
          }}
        >
          {creating ? "收起" : "新增用户"}
        </button>
      </div>

      <form method="get" className="row" style={{ gap: 10 }}>
        <input
          className="input"
          name="keyword"
          defaultValue={keyword}
          placeholder="搜索用户名 / 邮箱 / 昵称"
          style={{ maxWidth: 280 }}
        />
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <button type="submit" className="btn btn-sm">
          搜索
        </button>
      </form>

      {creating ? (
        <UserForm key="create" mode="create" onSaved={() => setCreating(false)} />
      ) : null}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 54 }}>ID</th>
              <th>用户</th>
              <th style={{ width: 190 }}>邮箱</th>
              <th style={{ width: 110 }}>第三方</th>
              <th style={{ width: 76 }}>通知</th>
              <th style={{ width: 60 }}>收藏</th>
              <th style={{ width: 90 }}>角色</th>
              <th style={{ width: 90 }}>状态</th>
              <th style={{ width: 150 }}>注册时间</th>
              <th style={{ width: 150 }}>最近登录</th>
              <th style={{ width: 80 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const act = activity[u.id] ?? {
                notifications: 0,
                unread: 0,
                favorites: 0,
              };
              const uIdentities = identities[u.id] ?? [];
              return (
                <tr key={u.id}>
                  <td className="text-muted">{u.id}</td>
                  <td>
                    <div className="row" style={{ gap: 9 }}>
                      <Avatar
                        src={u.avatar}
                        name={u.nickname || u.username}
                        size={30}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div className="strong">{u.username}</div>
                        {u.nickname && u.nickname !== u.username ? (
                          <div className="text-muted text-sm">{u.nickname}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="text-muted text-sm" style={{ overflowWrap: "anywhere" }}>
                    {u.email}
                  </td>
                  <td>
                    {uIdentities.length > 0 ? (
                      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                        {uIdentities.map((i) => (
                          <span key={i.provider} className="badge badge-accent">
                            {IDENTITY_PROVIDERS.find((p) => p.key === i.provider)
                              ?.short ?? i.provider}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted text-sm">-</span>
                    )}
                  </td>
                  <td className="text-sm nowrap">
                    {act.notifications}
                    {act.unread ? (
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        未读 {act.unread}
                      </div>
                    ) : null}
                  </td>
                  <td className="text-sm">{act.favorites}</td>
                  <td>
                    <RoleBadge role={u.role} />
                  </td>
                  <td>
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="text-muted text-sm nowrap">
                    {String(u.createdAt).slice(0, 16)}
                  </td>
                  <td className="text-muted text-sm nowrap">
                    {u.lastLoginAt ? String(u.lastLoginAt).slice(0, 16) : "-"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      aria-haspopup="dialog"
                      aria-expanded={openedId === u.id}
                      onClick={() => openUser(u.id)}
                    >
                      操作
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openedUser ? (
        <div
          className="user-modal-mask"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="user-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`管理用户 ${openedUser.username}`}
          >
            <div className="user-modal-head">
              <Avatar
                src={openedUser.avatar}
                name={openedUser.nickname || openedUser.username}
                size={40}
              />
              <div className="user-modal-identity">
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <strong>{openedUser.username}</strong>
                  <RoleBadge role={openedUser.role} />
                  <StatusBadge status={openedUser.status} />
                </div>
                <div className="hint user-modal-sub" title={openedUser.email}>
                  {openedUser.email}
                  {openedUser.nickname && openedUser.nickname !== openedUser.username
                    ? ` · ${openedUser.nickname}`
                    : ""}
                  {` · 通知 ${openedAct.notifications} / 收藏 ${openedAct.favorites}`}
                </div>
              </div>
              <button
                type="button"
                className="user-modal-close"
                aria-label="关闭"
                onClick={closeModal}
              >
                ×
              </button>
            </div>

            <div className="user-modal-body">
              {view !== "menu" ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost user-modal-back"
                  onClick={() => setView("menu")}
                >
                  ← 返回操作
                </button>
              ) : null}

              {view === "menu" ? (
                <div className="user-action-grid">
                  {openedCanManage ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setView("edit")}
                      >
                        编辑用户
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setView("reset")}
                      >
                        重置密码
                      </button>
                    </>
                  ) : null}

                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setView("notify")}
                  >
                    通知用户
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setView("bindings")}
                  >
                    绑定账号
                  </button>

                  {viewerIsOwner && openedUser.role === "admin" ? (
                    <form
                      action={transferOwnerAction}
                      onSubmit={(e) => {
                        if (
                          !confirm(
                            `确定把管理员「${openedUser.username}」提升为站长？\n你会自动降为管理员，站长身份随即转移。`
                          )
                        ) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={openedUser.id} />
                      <button
                        type="submit"
                        className="btn btn-outline"
                        style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
                      >
                        转移站长
                      </button>
                    </form>
                  ) : null}

                  {openedIsOwner ? null : openedUser.status === "banned" ? (
                    <form action={setUserStatusAction}>
                      <input type="hidden" name="id" value={openedUser.id} />
                      <input type="hidden" name="status" value="active" />
                      <button type="submit" className="btn btn-outline">
                        解封账号
                      </button>
                    </form>
                  ) : (
                    <form
                      action={setUserStatusAction}
                      onSubmit={(e) => {
                        if (!confirm(`确定封禁用户「${openedUser.username}」？`)) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={openedUser.id} />
                      <input type="hidden" name="status" value="banned" />
                      <button
                        type="submit"
                        className="btn btn-outline"
                        style={{ color: "var(--red)", borderColor: "var(--red)" }}
                      >
                        封禁账号
                      </button>
                    </form>
                  )}

                  {!openedIsOwner && openedUser.status === "pending" ? (
                    <form action={setUserStatusAction}>
                      <input type="hidden" name="id" value={openedUser.id} />
                      <input type="hidden" name="status" value="active" />
                      <button type="submit" className="btn btn-outline">
                        通过验证
                      </button>
                    </form>
                  ) : null}

                  {openedIsOwner ? null : (
                    <form
                      action={deleteUserAction}
                      onSubmit={(e) => {
                        if (
                          !confirm(
                            `确定删除用户「${openedUser.username}」？其投稿、收藏、通知会一并删除，操作不可撤销。`
                          )
                        ) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={openedUser.id} />
                      <button
                        type="submit"
                        className="btn btn-outline"
                        style={{ color: "var(--red)", borderColor: "var(--red)" }}
                      >
                        删除账号
                      </button>
                    </form>
                  )}
                </div>
              ) : view === "edit" ? (
                <UserForm
                  key={`edit-${openedUser.id}`}
                  mode="edit"
                  user={openedUser}
                  onSaved={closeModal}
                />
              ) : view === "reset" ? (
                <ResetPasswordForm
                  user={openedUser}
                  onClose={() => setView("menu")}
                />
              ) : view === "notify" ? (
                <UserNotify
                  userId={openedUser.id}
                  username={openedUser.username}
                  onClose={() => setView("menu")}
                />
              ) : (
                <BindingsPanel
                  user={openedUser}
                  identities={openedIdentities}
                  readOnly={!openedCanManage}
                  onClose={() => setView("menu")}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
