import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

/**
 * 站点地图 sitemap.xml
 *
 * 收录：首页、分类页、内容详情页（网址/文章/软件）。
 * 后台「SEO → 生成站点地图」关闭后返回 404。
 */

interface ContentRow {
  id: number;
  type: string;
  updated_at: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pathOf(type: string, id: number): string {
  if (type === "site") return `/sites/${id}.html`;
  if (type === "app") return `/app/${id}.html`;
  return `/${id}.html`;
}

export async function GET() {
  const cfg = await getSiteConfig();

  if (!cfg.seoSitemap) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const base = cfg.siteUrl.replace(/\/+$/, "");

  const [contents, cats] = await Promise.all([
    query<ContentRow>(
      `SELECT id, type, updated_at
         FROM knav_contents
        WHERE status = 'publish'
        ORDER BY updated_at DESC
        LIMIT 5000`
    ),
    query<{ slug: string }>(
      `SELECT slug FROM knav_categories WHERE slug <> ''`
    ),
  ]);

  const now = new Date().toISOString().slice(0, 10);
  const urls: string[] = [];

  urls.push(
    `  <url><loc>${esc(base)}/</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`
  );
  urls.push(
    `  <url><loc>${esc(base)}/submit</loc><lastmod>${now}</lastmod><changefreq>monthly</changefreq><priority>0.4</priority></url>`
  );
  urls.push(
    `  <url><loc>${esc(base)}/about</loc><lastmod>${now}</lastmod><changefreq>monthly</changefreq><priority>0.3</priority></url>`
  );

  for (const c of cats) {
    if (!c.slug) continue;
    urls.push(
      `  <url><loc>${esc(base)}/category/${esc(c.slug)}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`
    );
  }

  for (const p of contents) {
    const loc = `${base}${pathOf(p.type, p.id)}`;
    const lastmod = (p.updated_at || now).slice(0, 10);
    urls.push(
      `  <url><loc>${esc(loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
