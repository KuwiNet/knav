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
  saveBufferToLocal,
  MAX_IMAGE_BYTES,
} from "@/lib/media";
import type { FormState } from "./types";

/**
 * 素材库相关动作。
 * 所有操作都需要管理员权限。
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) throw new Error("无权访问");
  return user!;
}

/** 上传本地文件到 public/uploads */
export async function uploadMediaAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();
  const file = fd.get("file");
  // 不使用 instanceof File：Node 18 没有全局 File 构造函数，会直接抛 ReferenceError
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return { error: "请选择要上传的文件" };
  }
  const f = file as unknown as {
    size: number;
    type: string;
    name: string;
    arrayBuffer(): Promise<ArrayBuffer>;
  };
  if (!f.size) {
    return { error: "请选择要上传的文件" };
  }
  if (f.size > MAX_IMAGE_BYTES) {
    return { error: `文件过大（${Math.round(f.size / 1024 / 1024)}MB），上限 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB` };
  }

  const buf = Buffer.from(await f.arrayBuffer());
  const mime = (f.type || "application/octet-stream").toLowerCase();
  const ext = (f.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";

  const saved = await saveBufferToLocal(buf, ext, f.name);
  if (!saved.ok || !saved.relPath) return { error: saved.error ?? "保存失败" };

  await recordMedia({
    filename: f.name,
    path: saved.relPath,
    url: saved.relPath,
    mime,
    size: buf.length,
    width: saved.width ?? 0,
    height: saved.height ?? 0,
    alt: "",
  });

  await logAction("media.upload", f.name, { path: saved.relPath });
  revalidatePath("/admin/media");
  return { success: `上传成功：${saved.relPath}` };
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
  { ok: boolean; items: { id: number; url: string; filename: string }[] }
> {
  await requireAdmin();
  const keyword = String(fd.get("keyword") ?? "").trim();
  const { items } = await listMedia({ keyword, limit: 60 });
  return {
    ok: true,
    items: items.map((i) => ({ id: i.id, url: i.url, filename: i.filename })),
  };
}
