"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "概览", exact: true },
  { href: "/dashboard/favorites", label: "我的收藏" },
  { href: "/dashboard/submissions", label: "我的投稿" },
  { href: "/dashboard/notifications", label: "通知" },
  { href: "/dashboard/profile", label: "账号设置" },
];

export default function DashboardNav({
  unread,
}: {
  unread?: number;
}) {
  const pathname = usePathname();

  return (
    <div className="admin-nav">
      <div className="admin-nav-title">个人中心</div>
      {ITEMS.map((it) => {
        const active = it.exact
          ? pathname === it.href
          : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`admin-nav-item${active ? " active" : ""}`}
          >
            <span>{it.label}</span>
            {it.href === "/dashboard/notifications" && unread ? (
              <span className="badge badge-red" style={{ marginLeft: "auto" }}>
                {unread}
              </span>
            ) : null}
          </Link>
        );
      })}
      <div className="admin-nav-title">快捷操作</div>
      <Link href="/submit" className="admin-nav-item">
        <span>我要投稿</span>
      </Link>
    </div>
  );
}
