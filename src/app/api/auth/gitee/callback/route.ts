import { completeOAuth } from "@/lib/oauth-flow";

export const dynamic = "force-dynamic";

/** GET /api/auth/gitee/callback → 校验 state、换 token、建号登录 */
export async function GET(req: Request) {
  return completeOAuth(req, "gitee");
}
