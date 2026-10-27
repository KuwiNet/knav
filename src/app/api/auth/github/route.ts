import { startOAuth } from "@/lib/oauth-flow";

export const dynamic = "force-dynamic";

/** GET /api/auth/github → 跳转 GitHub 授权页 */
export async function GET(req: Request) {
  return startOAuth(req, "github");
}
