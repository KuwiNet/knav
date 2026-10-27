import Link from "next/link";
import { getSetting } from "@/lib/settings";
import {
  PROVIDER_LABEL,
  readSocialTicket,
  suggestUsername,
} from "@/lib/social-auth";
import SocialCompleteForm from "@/components/social-complete-form";

export const dynamic = "force-dynamic";

export default async function SocialCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string }>;
}) {
  const { ticket = "" } = await searchParams;
  const profile = ticket ? await readSocialTicket(ticket) : null;

  if (!profile) {
    return (
      <div className="container">
        <div className="auth-wrap">
          <h1 className="auth-title">第三方登录</h1>
          <div className="card card-pad">
            <div className="alert alert-error">
              这次授权已过期或链接无效，请回到登录页重新点击第三方登录。
            </div>
            <Link className="btn btn-block" href="/login">
              返回登录
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [suggested, allowRegister] = await Promise.all([
    suggestUsername(profile.username || profile.nickname || "user"),
    getSetting("allow_register").then((v) => v !== "0"),
  ]);

  return (
    <div className="container">
      <div className="auth-wrap">
        <h1 className="auth-title">完成 {PROVIDER_LABEL[profile.provider]} 登录</h1>
        <p className="auth-sub">
          这个 {PROVIDER_LABEL[profile.provider]} 账号还没有关联本站账号
        </p>
        <SocialCompleteForm
          ticket={ticket}
          providerLabel={PROVIDER_LABEL[profile.provider]}
          providerUsername={profile.username}
          providerEmail={profile.email}
          providerNickname={profile.nickname}
          suggestedUsername={suggested}
          allowRegister={allowRegister}
        />
        <div className="auth-foot">
          <Link href="/login">返回登录</Link>
        </div>
      </div>
    </div>
  );
}
