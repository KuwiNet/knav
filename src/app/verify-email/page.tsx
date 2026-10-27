import Link from "next/link";
import { verifyEmailAction } from "@/lib/actions/auth-actions";
import { ResendVerifyForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string;
    pending?: string;
    email?: string;
    provider?: string;
  }>;
}) {
  const { token = "", pending, email = "", provider = "" } = await searchParams;
  const awaiting = pending === "1" && !token;
  const state = token
    ? await verifyEmailAction(token)
    : { error: awaiting ? "" : "链接缺少验证令牌" };

  if (state.success) {
    return (
      <div className="container">
        <div className="auth-wrap">
          <h1 className="auth-title">邮箱验证</h1>
          <p className="auth-sub">验证你的邮箱地址</p>
          <div className="card card-pad">
            <div className="alert alert-success">{state.success}</div>
            <Link className="btn btn-block" href="/login">
              去登录
            </Link>
          </div>
          <div className="auth-foot">
            <Link href="/login">返回登录</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="auth-wrap">
        <h1 className="auth-title">邮箱验证</h1>
        <p className="auth-sub">验证你的邮箱地址</p>

        {awaiting ? (
          <>
            <div className="card card-pad" style={{ marginBottom: 14 }}>
              <div className="alert alert-info" style={{ marginBottom: 0 }}>
                {provider ? `${provider} 账号已关联本站账号，但邮箱还没有验证。` : null}
                我们已向 {email || "你的邮箱"} 发送验证邮件，请点击邮件里的链接完成验证后再登录。
              </div>
            </div>
            <div className="hint" style={{ marginBottom: 10, textAlign: "center" }}>
              没收到？可以重新发送一封：
            </div>
            <ResendVerifyForm defaultEmail={email} />
          </>
        ) : (
          <div className="card card-pad">
            <div className="alert alert-error">{state.error}</div>
            <p className="hint" style={{ marginBottom: 16 }}>
              验证链接 24 小时内有效，且只能使用一次。如果链接已过期，可以重新发送一封。
            </p>
            <ResendVerifyForm defaultEmail={email} />
          </div>
        )}

        <div className="auth-foot">
          <Link href="/login">返回登录</Link>
        </div>
      </div>
    </div>
  );
}
