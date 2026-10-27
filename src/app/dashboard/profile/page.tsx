import { getCurrentUser } from "@/lib/auth";
import { getSiteConfig } from "@/lib/site-config";
import {
  getOAuthProviderStatus,
  listUserIdentities,
  PROVIDER_LABEL,
  type Provider,
} from "@/lib/social-auth";
import {
  AvatarPanel,
  ProfileForm,
  PasswordForm,
  EmailForm,
} from "@/components/profile-forms";
import SocialBindings from "@/components/social-bindings";

export const dynamic = "force-dynamic";

function providerName(key: string): string {
  return PROVIDER_LABEL[key as Provider] ?? "第三方";
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ social?: string; provider?: string; social_error?: string }>;
}) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;

  const [identities, cfg, github, gitee, google] = await Promise.all([
    listUserIdentities(user.id),
    getSiteConfig(),
    getOAuthProviderStatus("github"),
    getOAuthProviderStatus("gitee"),
    getOAuthProviderStatus("google"),
  ]);

  // 分开传：后台开关与密钥配置要分别提示，否则「没配 Secret」会显示成「后台未开启」
  const enabled: Record<string, boolean> = {
    telegram: cfg.loginTelegram,
    github: github.enabled,
    gitee: gitee.enabled,
    google: google.enabled,
  };
  const configured: Record<string, boolean> = {
    telegram: Boolean(cfg.telegramBotName),
    github: github.configured,
    gitee: gitee.configured,
    google: google.configured,
  };

  const notice =
    sp.social === "bound"
      ? `已成功绑定 ${providerName(sp.provider || "")} 账号。`
      : undefined;

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        账号设置
      </h1>
      <p className="page-sub">
        用户名：{user.username} · 注册于 {String(user.createdAt).slice(0, 10)} · 角色：{user.role}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 18 }}>
        <AvatarPanel user={user} />
        <ProfileForm user={user} />
        <SocialBindings
          bindings={identities.map((i) => ({
            provider: i.provider,
            username: i.username,
            email: i.email,
          }))}
          enabled={enabled}
          configured={configured}
          telegramBotName={cfg.telegramBotName}
          notice={notice}
          error={sp.social_error || undefined}
        />
        <EmailForm user={user} />
        <PasswordForm hasPassword={user.hasPassword} />
      </div>
    </div>
  );
}
