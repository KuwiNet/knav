"use client";

import { useFormStatus } from "react-dom";
import { logoutAction } from "@/lib/actions/auth-actions";

function Inner() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-outline btn-sm btn-block" disabled={pending}>
      {pending ? "退出中…" : "退出登录"}
    </button>
  );
}

export default function LogoutButton() {
  return (
    <form action={logoutAction} style={{ marginTop: 12 }}>
      <Inner />
    </form>
  );
}
