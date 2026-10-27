import { ResetPasswordForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;

  return (
    <div className="container">
      <div className="auth-wrap">
        <h1 className="auth-title">重置密码</h1>
        <p className="auth-sub">设置一个新的登录密码</p>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="card card-pad">
            <div className="alert alert-error">链接缺少重置令牌，请重新发起找回密码。</div>
          </div>
        )}
      </div>
    </div>
  );
}
