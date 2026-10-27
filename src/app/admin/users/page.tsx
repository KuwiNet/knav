import { redirect } from "next/navigation";
import { getCurrentUser, listUsers } from "@/lib/auth";
import { getAdminStats } from "@/lib/admin";
import { getUserActivity } from "@/lib/admin-manage";
import { Pagination } from "@/components/pagination";
import UserManager from "@/components/admin/user-manager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; keyword?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = sp.status ?? "";
  const keyword = sp.keyword ?? "";

  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const [list, stats] = await Promise.all([
    listUsers({
      keyword: keyword || undefined,
      status: status || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getAdminStats(),
  ]);
  const users = list.users;
  const total = list.total;
  // 这一页用户的通知数与收藏数
  const activity = await getUserActivity(users.map((u) => u.id));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        用户管理
      </h1>
      <p className="page-sub">
        共 {total} 个账号。可新增、编辑资料、调整角色、封禁、重置密码与删除。
        <br />
        通知 {stats.notifications} 条（未读 {stats.unreadNotifications}）· 收藏{" "}
        {stats.favorites} 条 · 素材 {stats.media} 个。
      </p>

      <UserManager
        users={users}
        status={status}
        keyword={keyword}
        activity={activity}
        viewerId={viewer.id}
        viewerRole={viewer.role}
      />

      {totalPages > 1 ? (
        <Pagination
          current={page}
          totalPages={totalPages}
          basePath="/admin/users"
          extraParams={{
            ...(status ? { status } : {}),
            ...(keyword ? { keyword } : {}),
          }}
        />
      ) : null}
    </div>
  );
}
