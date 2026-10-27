import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * /uploads 动态读取。
 *
 * Next 生产模式启动时会把 public 下的文件列表快照进内存，
 * 启动之后才写入的上传文件不在快照里，会一直 404，重启才生效。
 * 这个路由负责兜底：快照里的文件仍由静态服务处理，
 * 新文件落到这里直接从磁盘读，不用重启。
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
  pdf: "application/pdf",
  zip: "application/zip",
  txt: "text/plain; charset=utf-8",
};

function notFound() {
  return new NextResponse("Not found", { status: 404 });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  if (!segments?.length) return notFound();

  // 文件名是内容哈希，允许长期缓存
  const root = path.join(process.cwd(), "public", "uploads");
  const abs = path.resolve(root, ...segments);
  if (abs !== root && !abs.startsWith(root + path.sep)) return notFound();

  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return notFound();
    const data = await fs.readFile(abs);
    const ext = path.extname(abs).slice(1).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Length": String(data.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return notFound();
  }
}
