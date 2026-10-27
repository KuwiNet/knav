import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * 上传文件的实际出口，/uploads/:path* 由 next.config 的 beforeFiles
 * 重写到这里。绕过 Next 的 public 静态快照（启动后才写入的文件会 404），
 * 也避开静态服务默认的 max-age=0（Cloudflare 每次都要回源校验）。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  // 历史数据里有 SVG 图标；上传入口本身不接受 SVG
  svg: "image/svg+xml",
  pdf: "application/pdf",
  zip: "application/zip",
  txt: "text/plain; charset=utf-8",
};

function notFound() {
  // 缺文件不能带长缓存，否则 404 会被 CDN 和浏览器缓存一年
  return new NextResponse("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  if (!segments?.length) return notFound();

  const root = path.join(process.cwd(), "public", "uploads");
  const abs = path.resolve(root, ...segments);
  if (abs !== root && !abs.startsWith(root + path.sep)) return notFound();

  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return notFound();
    const data = await fs.readFile(abs);
    const ext = path.extname(abs).slice(1).toLowerCase();
    const headers: Record<string, string> = {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Length": String(data.byteLength),
      // 上传文件名是随机串，内容不会变，可以长期缓存
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    };
    // 历史 SVG 图标直接打开时禁止执行脚本
    if (ext === "svg") {
      headers["Content-Security-Policy"] =
        "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }
    return new NextResponse(new Uint8Array(data), { headers });
  } catch {
    return notFound();
  }
}
