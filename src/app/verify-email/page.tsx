import Link from "next/link";
import { verifyEmailAction } from "@/lib/actions/auth-actions";
import { ResendVerifyForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const state = token ? await verifyEmailAction(token) : { error: "链接缺少验证令牌" };

  return (
    <div className="container">
      <div className="auth-wrap">
        <h1 className="auth-title">邮箱验证</h1>
        <p className="auth-sub">验证你的邮箱地址</p>

        {state.error ? (
          <div className="card card-pad">
            <div className="alert alert-error">{state.error}</div>
            <p className="hint" style={{ marginBottom: 16 }}>
              验证链接 24 小时内有效，且只能使用一次。如果链接已过期，可以重新发送一封。
            </p>
            <ResendVerifyForm />
          </div>
        ) : (
          <div className="card card-pad">
            <div className="alert alert-success">{state.success}</div>
            <Link className="btn btn-block" href="/login">
              去登录
            </Link>
          </div>
        )}

        <div className="auth-foot">
          <Link href="/login">返回登录</Link>
        </div>
      </div>
    </div>
  );
}
