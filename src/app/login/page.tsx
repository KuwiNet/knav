import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSiteConfig } from "@/lib/site-config";
import { LoginForm } from "@/components/auth-forms";
import SocialLogin from "@/components/social-login";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const [user, cfg, sp] = await Promise.all([
    getCurrentUser(),
    getSiteConfig(),
    searchParams,
  ]);
  if (user) redirect("/dashboard");

  const showSocial = cfg.loginGithub || cfg.loginGitee || cfg.loginGoogle;

  return (
    <div className="container">
      <div className="auth-wrap">
        <h1 className="auth-title">登录</h1>
        <p className="auth-sub">登录后可以投稿、收藏并接收审核通知</p>

        {cfg.loginPassword ? (
          <LoginForm allowRegister={cfg.allowRegister} />
        ) : (
          <div className="card card-pad">
            <div className="alert alert-error">账号密码登录已关闭，请使用第三方账号登录</div>
          </div>
        )}

        {showSocial ? (
          <SocialLogin
            githubEnabled={cfg.loginGithub}
            giteeEnabled={cfg.loginGitee}
            googleEnabled={cfg.loginGoogle}
            error={sp.err}
          />
        ) : null}
      </div>
    </div>
  );
}
