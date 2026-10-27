import { redirect } from "next/navigation";
import { getCurrentUser, unreadCount } from "@/lib/auth";
import DashboardNav from "@/components/dashboard-nav";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const unread = await unreadCount(user.id);

  return (
    <div className="container">
      <div className="admin-layout">
        <aside>
          <DashboardNav unread={unread} />
          <div className="aside-card" style={{ marginTop: 16 }}>
            <div className="aside-title">当前账号</div>
            <ul className="aside-list text-sm">
              <li className="aside-link">{user.username}</li>
              <li className="aside-link">{user.email}</li>
              <li className="aside-link">
                {user.emailVerified ? "邮箱已验证" : "邮箱未验证"}
              </li>
            </ul>
            <LogoutButton />
          </div>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
