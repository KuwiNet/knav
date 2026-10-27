import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSiteConfig } from "@/lib/site-config";
import { RegisterForm } from "@/components/auth-forms";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [user, cfg] = await Promise.all([getCurrentUser(), getSiteConfig()]);
  if (user) redirect("/dashboard");

  if (!cfg.allowRegister) {
    return (
      <div className="container">
        <div className="auth-wrap">
          <h1 className="auth-title">注册</h1>
          <p className="auth-sub">站点当前已关闭注册</p>
          <div className="card card-pad">
            <div className="alert alert-error">管理员已暂停新用户注册，请稍后再试。</div>
            <Link className="btn btn-block" href="/login">
              返回登录
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="auth-wrap">
        <h1 className="auth-title">注册</h1>
        <p className="auth-sub">注册后需验证邮箱，验证通过即可投稿</p>
        <RegisterForm />
      </div>
    </div>
  );
}
