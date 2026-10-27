// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  require("server-only");
}
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { query, execute } from "./db";
import type { MediaItem } from "./media-config";

export type { MediaItem };
export { formatSize } from "./media-config";

/**
 * 素材库 + 外链图片本地化。
 *
 * 需求：后台添加网址/文章/应用时，填的是远程图片地址，
 *      站点还要能长期稳定展示（对方挂防盗链/改地址就会裂图），
 *      所以保存时把外链图片抓到本地 public/uploads，并把地址改成本地路径。
 *
 * 落盘位置：public/uploads/YYYY/MM/<hash>.<ext>
 * 站内路径：/uploads/YYYY/MM/<hash>.<ext>
 */

export const UPLOAD_ROOT = "uploads";
/** 单张图片体积上限（字节） */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** 下载超时 */
const FETCH_TIMEOUT = 15000;

/* ---------------------------------------------------------------- 判断 */

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

const EXT_BY_MIME: Record<string, string> = {
  ...IMAGE_EXT_BY_MIME,
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/plain": "txt",
};

const MIME_BY_IMAGE_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

/** 扫描素材库时认的图片后缀（刻意不含 svg，见 imageExtFromBytes 的说明） */
const SCANNABLE_IMAGE_EXT = new Set(Object.keys(MIME_BY_IMAGE_EXT));

export function imageMimeOf(ext: string): string {
  return MIME_BY_IMAGE_EXT[ext.toLowerCase()] ?? "";
}

/** 是不是站外远程地址 */
export function isRemoteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/** 是不是站内/本地地址（相对路径、data:、blob:） */
export function isLocalUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return true;
  if (isRemoteUrl(u)) return false;
  return true;
}

/**
 * 从文件头判断真实图片格式，不信任文件名和后浏览器报的 MIME。
 *
 * 有意不收 SVG：SVG 能内嵌脚本，用户提交的 SVG 以同源图片地址打开就是一次存储型 XSS。
 * 用户上传头像走这里。
 */
export function imageExtFromBytes(buf: Buffer): string {
  if (buf.length < 12) return "";
  if (buf.subarray(0, 4).toString("hex") === "89504e47") return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  const head = buf.subarray(0, 6).toString("ascii");
  if (head === "GIF87a" || head === "GIF89a") return "gif";
  if (head.slice(0, 4) === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return "webp";
  }
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return "avif";
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d) return "bmp";
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return "ico";
  return "";
}

/* ---------------------------------------------------------------- 落盘 */

function publicDir(): string {
  return path.join(process.cwd(), "public");
}

function uploadDirFor(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return path.join(publicDir(), UPLOAD_ROOT, String(yyyy), mm);
}

function extFromUrl(url: string): string {
  try {
    const p = new URL(url).pathname;
    const m = p.match(/\.([a-z0-9]{2,5})$/i);
    return m ? m[1].toLowerCase() : "";
  } catch {
    return "";
  }
}

/** 读取图片尺寸（PNG/JPEG/GIF/WebP 头部解析，失败返回 0） */
function readImageSize(buf: Buffer, mime: string): { width: number; height: number } {
  try {
    // PNG
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    // GIF
    if (buf.length > 10 && buf.slice(0, 3).toString("ascii") === "GIF") {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    // WEBP
    if (buf.length > 30 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") {
      if (buf.slice(12, 16).toString("ascii") === "VP8X") {
        return {
          width: 1 + buf.readUIntLE(24, 3),
          height: 1 + buf.readUIntLE(27, 3),
        };
      }
    }
    // JPEG
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) {
          off++;
          continue;
        }
        const marker = buf[off + 1];
        const len = buf.readUInt16BE(off + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
        }
        off += 2 + len;
      }
    }
  } catch {
    /* 解析失败不影响入库 */
  }
  return { width: 0, height: 0 };
}

/** 写入文件，返回站内相对路径 */
async function saveBuffer(
  buf: Buffer,
  ext: string,
  filenameHint: string
): Promise<{ relPath: string; size: number }> {
  const d = new Date();
  const dir = uploadDirFor(d);
  await fs.promises.mkdir(dir, { recursive: true });

  const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16);
  const safeExt = ext.replace(/[^a-z0-9]/gi, "") || "bin";
  const fname = `${hash}.${safeExt}`;
  const abs = path.join(dir, fname);
  await fs.promises.writeFile(abs, buf);

  const rel = `/${UPLOAD_ROOT}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${fname}`;
  void filenameHint;
  return { relPath: rel, size: buf.length };
}

/**
 * 把一个二进制缓冲写进 public/uploads 并登记到素材库。
 * 后台「上传图片」与外链本地化都走这里。
 */
export async function saveBufferToLocal(
  buf: Buffer,
  ext: string,
  filenameHint: string
): Promise<{
  ok: boolean;
  relPath?: string;
  size?: number;
  width?: number;
  height?: number;
  error?: string;
}> {
  if (buf.length === 0) return { ok: false, error: "文件内容为空" };
  if (buf.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: "文件超过体积上限" };
  }
  const safeExt = ext.replace(/[^a-z0-9]/gi, "") || "bin";
  const mime = imageMimeOf(safeExt);
  const dim = mime ? readImageSize(buf, mime) : { width: 0, height: 0 };
  try {
    const { relPath, size } = await saveBuffer(buf, safeExt, filenameHint);
    return { ok: true, relPath, size, width: dim.width, height: dim.height };
  } catch (e: any) {
    const code = e?.code as string | undefined;
    const reason =
      code === "EACCES" || code === "EPERM"
        ? "运行用户对 public/uploads 没有写权限，请把该目录交给运行用户并设为 755"
        : e?.message ?? String(e);
    return { ok: false, error: `写入失败：${reason}` };
  }
}

/* ---------------------------------------------------------------- 下载 */

export interface DownloadResult {
  ok: boolean;
  url?: string;
  relPath?: string;
  bytes?: number;
  mime?: string;
  width?: number;
  height?: number;
  sourceUrl?: string;
  error?: string;
}

/**
 * 下载一个远程资源到本地。
 * 失败时返回 ok=false，调用方保留原地址（宁可裂图也不要丢内容）。
 */
export async function downloadToLocal(
  remoteUrl: string,
  opts: { filename?: string } = {}
): Promise<DownloadResult> {
  if (!isRemoteUrl(remoteUrl)) {
    return { ok: false, error: "不是远程地址" };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  let res: Response;
  try {
    res = await fetch(remoteUrl, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        // 一些站点会对没有 UA / Referer 的请求返回 403
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
  } catch (e: any) {
    clearTimeout(timer);
    return { ok: false, error: `下载失败：${e?.message ?? e}` };
  }
  clearTimeout(timer);

  if (!res.ok) {
    return { ok: false, error: `下载失败：HTTP ${res.status}` };
  }

  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mime && !mime.startsWith("image/") && !mime.startsWith("application/")) {
    return { ok: false, error: `不支持的类型：${mime}` };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) return { ok: false, error: "下载内容为空" };
  if (buf.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: `体积超过限制（${Math.round(buf.length / 1024 / 1024)}MB）` };
  }

  const urlExt = extFromUrl(remoteUrl);
  if (mime === "image/svg+xml" || urlExt === "svg") {
    return { ok: false, error: "不支持 SVG 图片（可能内嵌脚本，存在安全风险）" };
  }

  // 图片必须按文件头认出来：服务端 MIME 和 URL 后缀都可能骗人。
  const sniffed = imageExtFromBytes(buf);
  const claimsImage = mime.startsWith("image/") || Boolean(MIME_BY_IMAGE_EXT[urlExt]);
  if (claimsImage && !sniffed) {
    return { ok: false, error: "图片内容无法识别，已拒绝保存" };
  }

  const ext =
    sniffed ||
    IMAGE_EXT_BY_MIME[mime] ||
    (mime ? EXT_BY_MIME[mime] : "") ||
    urlExt ||
    "png";

  try {
    const { relPath, size } = await saveBuffer(buf, ext, opts.filename ?? "");
    const size2 = mime.startsWith("image/") ? readImageSize(buf, mime) : { width: 0, height: 0 };
    return {
      ok: true,
      url: relPath,
      relPath,
      bytes: size,
      mime: mime || "application/octet-stream",
      width: size2.width,
      height: size2.height,
      sourceUrl: remoteUrl,
    };
  } catch (e: any) {
    return { ok: false, error: `写入失败：${e?.message ?? e}` };
  }
}

/* ---------------------------------------------------------------- 本地化 */

/**
 * 把远程图片地址换成本地地址。
 * 已经是本地地址的直接返回；下载失败也返回原地址（不阻断保存）。
 */
export async function localizeImage(url: string): Promise<string> {
  const u = url?.trim() ?? "";
  if (!u || !isRemoteUrl(u)) return u;

  // 已经是本站的绝对地址就不用再抓一次
  const siteUrl = (await getSiteUrlSafe()).replace(/\/+$/, "");
  if (siteUrl && u.startsWith(siteUrl)) return u;

  const r = await downloadToLocal(u);
  if (r.ok && r.relPath) {
    await recordMedia({
      filename: fileNameOf(u),
      path: r.relPath,
      url: r.relPath,
      mime: r.mime ?? "",
      size: r.bytes ?? 0,
      width: r.width ?? 0,
      height: r.height ?? 0,
      sourceUrl: u,
    });
    return r.relPath;
  }
  return u;
}

/** 批量本地化 */
export async function localizeImages(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const u of urls) out.push(await localizeImage(u));
  return out;
}

/**
 * 把 Markdown / HTML 正文里的外链图片换成本地地址。
 * 覆盖两种写法：![alt](https://...) 与 <img src="https://...">
 */
export async function localizeContentImages(text: string): Promise<string> {
  if (!text) return text;
  const urls = new Set<string>();

  const mdRe = /!\[[^\]]*\]\(\s*(https?:\/\/[^)\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(text))) urls.add(m[1]);

  const htmlRe = /<img\b[^>]*?\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  while ((m = htmlRe.exec(text))) urls.add(m[1]);

  if (urls.size === 0) return text;

  const map = new Map<string, string>();
  for (const u of urls) map.set(u, await localizeImage(u));

  let out = text;
  for (const [from, to] of map) {
    if (from === to) continue;
    out = out.split(from).join(to);
  }
  return out;
}

/* ---------------------------------------------------------------- 素材库 */

/** 记录一个素材（同一路径只记一次） */
export async function recordMedia(input: {
  filename: string;
  path: string;
  url?: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  alt?: string;
  sourceUrl?: string;
}): Promise<void> {
  if (!input.path) return;
  const existing = await query<{ id: number }>(
    "SELECT id FROM knav_media WHERE path = ? LIMIT 1",
    [input.path]
  );
  if (existing.length > 0) {
    await execute(
      "UPDATE knav_media SET filename = ?, mime = ?, size = ?, width = ?, height = ?, alt = ?, source_url = ? WHERE id = ?",
      [
        input.filename,
        input.mime ?? "",
        input.size ?? 0,
        input.width ?? 0,
        input.height ?? 0,
        input.alt ?? "",
        input.sourceUrl ?? "",
        existing[0].id,
      ]
    );
    return;
  }
  await execute(
    `INSERT INTO knav_media (filename, path, url, mime, size, width, height, alt, source_url)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      input.filename,
      input.path,
      input.url ?? input.path,
      input.mime ?? "",
      input.size ?? 0,
      input.width ?? 0,
      input.height ?? 0,
      input.alt ?? "",
      input.sourceUrl ?? "",
    ]
  );
}

/** 素材列表 */
export async function listMedia(
  opts: { limit?: number; offset?: number; keyword?: string } = {}
): Promise<{ items: MediaItem[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const kw = (opts.keyword ?? "").trim();

  let where = "";
  const params: any[] = [];
  if (kw) {
    where = "WHERE filename LIKE ? OR alt LIKE ? OR source_url LIKE ?";
    params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
  }

  const totalRow = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM knav_media ${where}`,
    params
  );
  const rows = await query<any>(
    `SELECT id, filename, path, url, mime, size, width, height, alt, source_url, created_at
     FROM knav_media ${where}
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    total: Number(totalRow[0]?.n ?? 0),
    items: rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      path: r.path,
      url: r.url,
      mime: r.mime,
      size: Number(r.size ?? 0),
      width: Number(r.width ?? 0),
      height: Number(r.height ?? 0),
      alt: r.alt ?? "",
      sourceUrl: r.source_url ?? "",
      createdAt: r.created_at,
    })),
  };
}

export interface ScanUploadsResult {
  ok: boolean;
  /** 检查过的图片文件数 */
  scanned: number;
  /** 新登记进素材库的数量 */
  added: number;
  /** 后缀像图片、但内容不是图片而跳过的数量 */
  failed: number;
  error?: string;
}

/**
 * 扫描 public/uploads，把磁盘上已有、但数据库里没登记的图片补进素材库。
 *
 * 手工拷贝/恢复 uploads 后素材库为空，就是缺了这一步：素材库读的是
 * knav_media，不是目录列表。文件属主是 root 不会影响读取，只要运行用户有 r 权限。
 */
export async function scanUploadsToMedia(): Promise<ScanUploadsResult> {
  const root = path.join(publicDir(), UPLOAD_ROOT);
  try {
    const st = await fs.promises.stat(root);
    if (!st.isDirectory()) {
      return { ok: false, scanned: 0, added: 0, failed: 0, error: "public/uploads 不是目录" };
    }
  } catch {
    return { ok: true, scanned: 0, added: 0, failed: 0 };
  }

  let known: Set<string>;
  try {
    const rows = await query<{ path: string }>(
      "SELECT path FROM knav_media WHERE path LIKE ?",
      [`/${UPLOAD_ROOT}/%`]
    );
    known = new Set(rows.map((r) => r.path));
  } catch (e: any) {
    return {
      ok: false,
      scanned: 0,
      added: 0,
      failed: 0,
      error: `读取素材记录失败：${e?.message ?? e}`,
    };
  }

  const files: string[] = [];
  const collect = async (dir: string, depth: number): Promise<void> => {
    if (depth > 4) return;
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await collect(abs, depth + 1);
      } else if (
        entry.isFile() &&
        SCANNABLE_IMAGE_EXT.has(path.extname(entry.name).slice(1).toLowerCase())
      ) {
        files.push(abs);
      }
    }
  };

  try {
    await collect(root, 0);
  } catch (e: any) {
    const code = e?.code as string | undefined;
    const reason =
      code === "EACCES" || code === "EPERM"
        ? "运行用户对 public/uploads 没有读权限，请把目录设为 755 并确认属主"
        : e?.message ?? String(e);
    return { ok: false, scanned: 0, added: 0, failed: 0, error: `扫描失败：${reason}` };
  }

  let added = 0;
  let failed = 0;
  for (const abs of files) {
    const rel = `/${path.relative(publicDir(), abs).split(path.sep).join("/")}`;
    if (known.has(rel)) continue;

    try {
      const st = await fs.promises.stat(abs);
      if (!st.isFile() || st.size === 0) continue;
      const ext = path.extname(abs).slice(1).toLowerCase();

      // 只读文件头，避免把超大文件整个读进内存；不信任后缀
      const fh = await fs.promises.open(abs, "r");
      const head = Buffer.alloc(32);
      const { bytesRead } = await fh.read(head, 0, head.length, 0);
      await fh.close();
      if (!imageExtFromBytes(head.subarray(0, bytesRead))) {
        failed++;
        continue;
      }

      let width = 0;
      let height = 0;
      if (st.size <= MAX_IMAGE_BYTES) {
        const buf = await fs.promises.readFile(abs);
        const dim = readImageSize(buf, imageMimeOf(ext));
        width = dim.width;
        height = dim.height;
      }

      await recordMedia({
        filename: path.basename(abs),
        path: rel,
        url: rel,
        mime: imageMimeOf(ext),
        size: st.size,
        width,
        height,
      });
      known.add(rel);
      added++;
    } catch {
      failed++;
    }
  }

  return { ok: true, scanned: files.length, added, failed };
}

/** 删除素材记录（可选同时删文件） */
export async function deleteMedia(
  id: number,
  removeFile = true
): Promise<{ ok: boolean; error?: string }> {
  const row = await query<{ path: string }>(
    "SELECT path FROM knav_media WHERE id = ? LIMIT 1",
    [id]
  );
  if (row.length === 0) return { ok: false, error: "素材不存在" };
  await execute("DELETE FROM knav_media WHERE id = ?", [id]);

  if (removeFile && row[0].path.startsWith(`/${UPLOAD_ROOT}/`)) {
    const abs = path.join(publicDir(), row[0].path.replace(/^\/+/, ""));
    // 防目录穿越
    if (abs.startsWith(path.join(publicDir(), UPLOAD_ROOT))) {
      await fs.promises.unlink(abs).catch(() => undefined);
    }
  }
  return { ok: true };
}

/** 站点地址（用于判断是否已经是本站资源） */
async function getSiteUrlSafe(): Promise<string> {
  try {
    const { getSetting } = await import("./settings");
    return (await getSetting("site_url")) || "";
  } catch {
    return "";
  }
}

/** 从 URL 里取文件名 */
export function fileNameOf(url: string): string {
  try {
    const p = new URL(url).pathname;
    const n = p.split("/").filter(Boolean).pop();
    return n || "image";
  } catch {
    return url.split("/").pop() || "image";
  }
}

