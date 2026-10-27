import { startOAuth } from "@/lib/oauth-flow";

export const dynamic = "force-dynamic";

/** GET /api/auth/google → 跳转 Google 授权页 */
export async function GET(req: Request) {
  return startOAuth(req, "google");
}
