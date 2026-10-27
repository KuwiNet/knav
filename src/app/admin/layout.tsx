import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin, isOwner } from "@/lib/auth";
import { listSubmissions } from "@/lib/submissions";
import AdminNav from "@/components/admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/dashboard");

  const { total: pending } = await listSubmissions({
    status: "pending",
    limit: 1,
  });

  return (
    <div className="container">
      <div className="admin-layout">
        <aside>
          <AdminNav pendingSubmissions={pending} isOwner={isOwner(user)} />
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
