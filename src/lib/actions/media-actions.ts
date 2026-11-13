"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { logAction } from "@/lib/admin-log";
import {
  downloadToLocal,
  recordMedia,
  deleteMedia,
  listMedia,
  fileNameOf,
  imageExtFromBytes,
  svgExtFromBytes,
  imageMimeOf,
  saveBufferToLocal,
  scanUploadsToMedia,
  fileKindFromBytes,
  saveBufferedFile,
  FILE_KIND_HINT,
  MAX_IMAGE_BYTES,
  MAX_FILE_BYTES,
} from "@/lib/media";
import type { AssetUploadState, FileUploadState, FormState } from "./types";

/**
 * 素材库相关动作。
 * 所有操作都需要管理员权限。
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) throw new Error("无权访问");
  return user!;
}

type SavedUpload = {
  buf: Buffer;
  filename: string;
  mime: string;
  relPath: string;
  width?: number;
  height?: number;
};

/**
 * 判断表单项是不是上传的文件。
 * 不用 `instanceof File`：Node 18 没有全局 File 构造函数，会直接抛 ReferenceError，
 * 而这里的类型标注编译后会被擦除，不产生运行时引用。
 */
function isFileLike(entry: FormDataEntryValue | null): entry is File {
  return !!entry && typeof entry === "object" && "arrayBuffer" in entry;
}

const nameOf = (entry: FormDataEntryValue | null) =>
  isFileLike(entry) ? entry.name : "所选文件";

/** 校验并保存单个上传图片，素材库与内容编辑共用 */
async function saveImageEntry(
  entry: FormDataEntryValue | null
): Promise<{ ok: true; file: SavedUpload } | { ok: false; error: string }> {
  if (!isFileLike(entry)) {
    return { ok: false, error: "请选择要上传的文件" };
  }
  const f = entry;
  if (!f.size) {
    return { ok: false, error: "文件内容为空" };
  }
  if (f.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `文件过大（${Math.round(f.size / 1024 / 1024)}MB），上限 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB`,
    };
  }

  const buf = Buffer.from(await f.arrayBuffer());
  // 按内容判断真实格式：浏览器报的 MIME 和文件名都可能被改，
  // 伪装成 .png 的 HTML/SVG 放到同源静态目录会变成存储型 XSS。
  // SVG 只收纯图形，脚本、事件属性和外链在 svgExtFromBytes 里拒绝。
  const ext = imageExtFromBytes(buf) || svgExtFromBytes(buf);
  if (!ext) {
    return {
      ok: false,
      error:
        "只支持 PNG / JPEG / GIF / WebP / AVIF / BMP / ICO 图片；SVG 仅支持不含脚本、事件属性和外链的纯图形文件",
    };
  }
  const mime = imageMimeOf(ext);

  const saved = await saveBufferToLocal(buf, ext, f.name);
  if (!saved.ok || !saved.relPath) {
    return { ok: false, error: saved.error ?? "保存失败" };
  }
  return {
    ok: true,
    file: {
      buf,
      filename: f.name,
      mime,
      relPath: saved.relPath,
      width: saved.width,
      height: saved.height,
    },
  };
}

/** 上传本地文件到 public/uploads（可一次多选） */
export async function uploadMediaAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const picked = fd.getAll("file");
  if (!picked.length) return { error: "请选择要上传的文件" };

  const saved: SavedUpload[] = [];
  const failed: string[] = [];
  for (const entry of picked) {
    const r = await saveImageEntry(entry);
    if (!r.ok) {
      failed.push(
        picked.length > 1 ? `${nameOf(entry)}：${r.error}` : r.error
      );
      continue;
    }
    const { file } = r;
    await recordMedia({
      filename: file.filename,
      path: file.relPath,
      url: file.relPath,
      mime: file.mime,
      size: file.buf.length,
      width: file.width ?? 0,
      height: file.height ?? 0,
      alt: "",
    });
    saved.push(file);
  }

  if (!saved.length) return { error: failed.join("；") };

  await logAction(
    "media.upload",
    saved.map((s) => s.filename).join(", "),
    { paths: saved.map((s) => s.relPath), failed: failed.length }
  );
  revalidatePath("/admin/media");

  const tail = failed.length ? `；${failed.length} 个失败：${failed.join("；")}` : "";
  if (saved.length === 1) return { success: `上传成功：${saved[0].relPath}${tail}` };
  return { success: `已上传 ${saved.length} 个素材${tail}` };
}

/** 内容编辑页直接上传图标 / 封面，返回站内地址并同步登记素材库 */
export async function uploadContentAssetAction(
  fd: FormData
): Promise<AssetUploadState> {
  await requireAdmin();
  const r = await saveImageEntry(fd.get("file"));
  if (!r.ok) return { ok: false, error: r.error };
  const { file } = r;

  await recordMedia({
    filename: file.filename,
    path: file.relPath,
    url: file.relPath,
    mime: file.mime,
    size: file.buf.length,
    width: file.width ?? 0,
    height: file.height ?? 0,
    alt: "",
  });

  await logAction("content.asset.upload", file.filename, { path: file.relPath });
  revalidatePath("/admin/media");
  return { ok: true, url: file.relPath };
}

/**
 * 编辑器「添加文件」上传附件。
 *
 * 与图片通道分开：附件不是拿来内嵌展示的，体积上限放宽到 20MB，
 * 类型只按文件头魔数收白名单（文档 / 压缩包 / 音视频 / 图片），
 * 落盘后同样登记素材库，素材库删素材时文件一并清掉。
 */
export async function uploadContentFileAction(
  fd: FormData
): Promise<FileUploadState> {
  await requireAdmin();
  const file = fd.get("file");
  if (!isFileLike(file)) return { ok: false, error: "请选择要上传的文件" };
  const f = file;
  if (!f.size) return { ok: false, error: "请选择要上传的文件" };
  if (f.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `文件过大（${Math.round(f.size / 1024 / 1024)}MB），上限 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB`,
    };
  }

  const buf = Buffer.from(await f.arrayBuffer());
  const kind = fileKindFromBytes(buf);
  if (!kind.ext) {
    return { ok: false, error: `无法确认文件类型（不是按扩展名判断的）。支持：${FILE_KIND_HINT}` };
  }

  const saved = await saveBufferedFile(buf, kind.ext, f.name);
  if (!saved.ok) return { ok: false, error: saved.error };

  await recordMedia({
    filename: f.name,
    path: saved.relPath,
    url: saved.relPath,
    mime: kind.mime,
    size: saved.size,
    width: 0,
    height: 0,
    alt: "",
  });

  await logAction("content.file.upload", f.name, {
    path: saved.relPath,
    mime: kind.mime,
  });
  revalidatePath("/admin/media");
  return {
    ok: true,
    url: saved.relPath,
    filename: f.name,
    mime: kind.mime,
    size: saved.size,
  };
}

/** 扫描 public/uploads，登记磁盘上已有但数据库没记录的图片 */
export async function scanMediaAction(
  _prev: FormState,
  _fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const r = await scanUploadsToMedia();
  if (!r.ok) return { error: r.error ?? "扫描失败" };

  await logAction("media.scan", "public/uploads", {
    scanned: r.scanned,
    added: r.added,
    failed: r.failed,
  });
  revalidatePath("/admin/media");

  if (r.added > 0) {
    const skipped = r.failed > 0 ? `，跳过 ${r.failed} 个非图片文件` : "";
    return {
      success: `扫描完成：新登记 ${r.added} 个素材（共检查 ${r.scanned} 个文件${skipped}）`,
    };
  }
  if (r.scanned === 0) return { success: "public/uploads 里还没有图片文件" };
  return {
    success:
      r.failed > 0
        ? `扫描完成：${r.scanned - r.failed} 个图片都已登记，跳过 ${r.failed} 个非图片文件`
        : `扫描完成：${r.scanned} 个图片都已登记`,
  };
}

/** 把外链图片下载到本地并入库 */
export async function localizeMediaAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const url = String(fd.get("url") ?? "").trim();
  if (!url) return { error: "请填写图片地址" };

  const r = await downloadToLocal(url);
  if (!r.ok) return { error: r.error ?? "下载失败" };

  await recordMedia({
    filename: fileNameOf(url),
    path: r.relPath!,
    url: r.relPath!,
    mime: r.mime ?? "",
    size: r.bytes ?? 0,
    width: r.width ?? 0,
    height: r.height ?? 0,
    sourceUrl: url,
  });

  await logAction("media.localize", url, { path: r.relPath });
  revalidatePath("/admin/media");
  return { success: `已本地化：${r.relPath}` };
}

/** 删除素材 */
export async function deleteMediaAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!id) return;
  const r = await deleteMedia(id);
  if (!r.ok) throw new Error(r.error ?? "删除失败");
  await logAction("media.delete", `素材 #${id}`);
  revalidatePath("/admin/media");
}

/** 查询素材（给编辑器弹窗用） */
export async function searchMediaAction(fd: FormData): Promise<
  { ok: boolean; items: { id: number; url: string; filename: string; mime: string }[] }
> {
  await requireAdmin();
  const keyword = String(fd.get("keyword") ?? "").trim();
  const { items } = await listMedia({ keyword, limit: 60 });
  return {
    ok: true,
    items: items.map((i) => ({
      id: i.id,
      url: i.url,
      filename: i.filename,
      mime: i.mime ?? "",
    })),
  };
}
