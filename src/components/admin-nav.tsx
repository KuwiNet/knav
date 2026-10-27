"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS: { title: string; items: { href: string; label: string; badge?: number }[] }[] = [
  {
    title: "概览",
    items: [{ href: "/admin", label: "数据统计" }],
  },
  {
    title: "内容",
    items: [
      { href: "/admin/submissions", label: "投稿审核" },
      { href: "/admin/content", label: "内容管理" },
      { href: "/admin/categories", label: "分类管理" },
      { href: "/admin/downloads", label: "下载管理" },
      { href: "/admin/media", label: "素材库" },
    ],
  },
  {
    title: "用户",
    items: [{ href: "/admin/users", label: "用户管理" }],
  },
  {
    title: "系统",
    items: [
      { href: "/admin/import", label: "数据迁移" },
      { href: "/admin/mail", label: "消息日志" },
      { href: "/admin/settings", label: "站点设置" },
    ],
  },
];

export default function AdminNav({
  pendingSubmissions,
  isOwner = false,
}: {
  pendingSubmissions?: number;
  /** 站长专属入口（站点重置） */
  isOwner?: boolean;
}) {
  const pathname = usePathname();

  const groups = GROUPS.map((g) =>
    isOwner && g.title === "系统"
      ? { ...g, items: [...g.items, { href: "/admin/reset", label: "站点重置" }] }
      : g
  );

  return (
    <div className="admin-nav">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="admin-nav-title">{g.title}</div>
          {g.items.map((it) => {
            const active =
              it.href === "/admin" ? pathname === "/admin" : pathname.startsWith(it.href);
            const badge =
              it.href === "/admin/submissions" ? pendingSubmissions : undefined;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`admin-nav-item${active ? " active" : ""}`}
              >
                <span>{it.label}</span>
                {badge ? (
                  <span className="badge badge-red" style={{ marginLeft: "auto" }}>
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
