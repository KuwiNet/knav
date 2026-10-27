import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import SiteResetPanel from "@/components/admin/site-reset-panel";

export const dynamic = "force-dynamic";

export default async function AdminResetPage() {
  const user = await getCurrentUser();
  if (!user || !isOwner(user)) redirect("/admin");

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        站点重置
      </h1>
      <p className="page-sub">
        仅站长可执行，清空前需要站长邮箱验证码。按类别勾选要清空的数据，站长账号与当前登录会话不会被删除。
      </p>
      <SiteResetPanel email={user.email} />
    </div>
  );
}
