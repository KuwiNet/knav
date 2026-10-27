import { getCurrentUser } from "@/lib/auth";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  await getCurrentUser();

  return (
    <div className="container">
      <div className="auth-wrap">
        <h1 className="auth-title">找回密码</h1>
        <p className="auth-sub">我们会向你的邮箱发送一个重置链接</p>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
