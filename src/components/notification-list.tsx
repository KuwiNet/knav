"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/lib/actions/auth-actions";

/**
 * 站内通知列表。
 *
 * 点击整行即标记已读；「查看详情」弹层展示完整正文，同样算已读。
 * 已读状态先在本地叠加，服务端 revalidate 回来后以 props 为准。
 */

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string;
  isRead: boolean;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  verify: "账号",
  system: "系统",
  admin: "管理员",
  submit: "投稿",
  review: "审核",
};

function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? "通知";
}

function formatTime(raw: string): string {
  const s = String(raw ?? "");
  return s.length >= 16 ? s.slice(0, 16) : s;
}

function NoticeDetail({
  notice,
  onClose,
}: {
  notice: NotificationItem;
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
      className="notice-mask"
      role="dialog"
      aria-modal="true"
      aria-label="通知详情"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="notice-modal">
        <div className="notice-modal-head">
          <div style={{ minWidth: 0 }}>
            <span className="badge badge-accent">{typeLabel(notice.type)}</span>
            <strong className="notice-modal-title">{notice.title}</strong>
            <div className="hint">{formatTime(notice.createdAt)}</div>
          </div>
          <button type="button" className="btn btn-sm btn-outline" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="notice-modal-body">{notice.body}</div>
        {notice.link ? (
          <div className="notice-modal-foot">
            <Link href={notice.link} className="btn btn-sm" onClick={onClose}>
              前往查看
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function NotificationList({
  notices,
}: {
  notices: NotificationItem[];
}) {
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<NotificationItem | null>(null);
  const [pending, startTransition] = useTransition();

  const isRead = (n: NotificationItem) => n.isRead || readIds.has(n.id);
  const unread = notices.filter((n) => !isRead(n)).length;

  const markRead = (n: NotificationItem) => {
    if (isRead(n)) return;
    setReadIds((prev) => new Set(prev).add(n.id));
    const fd = new FormData();
    fd.set("id", String(n.id));
    startTransition(async () => {
      try {
        await markNotificationReadAction(fd);
      } catch {
        // 服务端失败也不回滚：下次刷新还会显示未读
      }
    });
  };

  const openDetail = (n: NotificationItem) => {
    markRead(n);
    setActive(n);
  };

  const markAll = () => {
    if (unread === 0) return;
    setReadIds(new Set(notices.map((n) => n.id)));
    startTransition(async () => {
      try {
        await markAllNotificationsReadAction();
      } catch {
        // 忽略，刷新后以服务端为准
      }
    });
  };

  return (
    <div>
      <div
        className="row"
        style={{ justifyContent: "space-between", gap: 12, marginBottom: 4 }}
      >
        <h1 className="page-title" style={{ margin: 0 }}>
          通知
        </h1>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={markAll}
          disabled={unread === 0 || pending}
        >
          全部标记为已读
        </button>
      </div>
      <p className="page-sub">
        共 {notices.length} 条通知
        {unread > 0 ? `，${unread} 条未读` : "，已全部读完"}。
        审核结果同时会发送到注册邮箱。
      </p>

      {notices.length === 0 ? (
        <div className="card card-pad">
          <div className="empty">
            <div className="empty-title">暂时没有通知</div>
            <div className="text-sm">
              投稿审核结果、账号安全提醒都会出现在这里。
            </div>
          </div>
        </div>
      ) : (
        <div className="card card-pad">
          <ul className="aside-list">
            {notices.map((n) => {
              const read = isRead(n);
              return (
                <li key={n.id}>
                  <div
                    className={`notice-row${read ? "" : " is-unread"}`}
                    role="button"
                    tabIndex={0}
                    title={read ? "查看详情" : "点击标记为已读"}
                    onClick={() => markRead(n)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        markRead(n);
                      }
                    }}
                  >
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      {!read ? (
                        <span className="badge badge-accent">未读</span>
                      ) : (
                        <span className="badge">{typeLabel(n.type)}</span>
                      )}
                      <strong className="notice-title">{n.title}</strong>
                      <span
                        className="text-muted text-sm nowrap"
                        style={{ marginLeft: "auto" }}
                      >
                        {formatTime(n.createdAt)}
                      </span>
                    </div>
                    <div className="notice-preview">{n.body}</div>
                    <div className="row" style={{ gap: 10, marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(n);
                        }}
                      >
                        查看详情
                      </button>
                      {!read ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            markRead(n);
                          }}
                        >
                          标记已读
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {active ? (
        <NoticeDetail notice={active} onClose={() => setActive(null)} />
      ) : null}
    </div>
  );
}
