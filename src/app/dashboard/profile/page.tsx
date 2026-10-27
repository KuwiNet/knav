import { getCurrentUser } from "@/lib/auth";
import {
  AvatarPanel,
  ProfileForm,
  PasswordForm,
  EmailForm,
} from "@/components/profile-forms";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = (await getCurrentUser())!;

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        账号设置
      </h1>
      <p className="page-sub">
        用户名：{user.username} · 注册于 {String(user.createdAt).slice(0, 10)} · 角色：{user.role}
      </p>

      <div style={{ display: "grid", gap: 18 }}>
        <AvatarPanel user={user} />
        <ProfileForm user={user} />
        <EmailForm user={user} />
        <PasswordForm />
      </div>
    </div>
  );
}
