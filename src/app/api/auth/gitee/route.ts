import { startOAuth } from "@/lib/oauth-flow";

export const dynamic = "force-dynamic";

/** GET /api/auth/gitee → 跳转 Gitee 授权页 */
export async function GET(req: Request) {
  return startOAuth(req, "gitee");
}
