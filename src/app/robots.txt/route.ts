import { NextResponse } from "next/server";
import { getSiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

/**
 * robots.txt
 *
 * 内容取后台「SEO → robots.txt 内容」，站点地址取「基础信息 → 站点地址」，
 * 后台改动立即生效，不用重新部署。
 */
export async function GET() {
  const cfg = await getSiteConfig();
  const base = cfg.siteUrl.replace(/\/+$/, "");

  let body = cfg.seoRobots.trim();
  if (!body) body = "User-agent: *\nAllow: /";

  // 站点地图地址跟着站点地址走
  if (!/sitemap\.xml/i.test(body)) {
    body += `\n\nSitemap: ${base}/sitemap.xml`;
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
