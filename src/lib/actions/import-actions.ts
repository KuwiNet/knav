"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { createExternalPool, execute, query } from "@/lib/db";
import { logAction } from "@/lib/admin-log";
import { putSnapshot, getSnapshot } from "@/lib/importer/cache";
import { scanDatabase } from "@/lib/importer/mysql-source";
import { scanSqlDumpFile } from "@/lib/importer/dump-source";
import { parseWxr } from "@/lib/importer/wxr";
import { runImport } from "@/lib/importer/run";
import { SYSTEM_LABEL } from "@/lib/importer/systems";
import type { ImportScanResult, ImportSnapshot } from "@/lib/importer/types";

/**
 * 后台「数据迁移」的 Server Actions。
 *
 * 流程：扫描来源 → 勾选要导入的分类/内容 → 执行导入。
 * 导入记录写进 knav_import_jobs，便于回溯。
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) throw new Error("无权访问");
  return user!;
}

/** 扫描来源，生成可选清单 */
export async function scanImportAction(
  fd: FormData
): Promise<{ ok: boolean; error?: string; result?: ImportScanResult }> {
  await requireAdmin();

  const sourceType = String(fd.get("sourceType") ?? "mysql");
  const prefixHint = String(fd.get("tablePrefix") ?? "").trim();
  let snapshot: ImportSnapshot;
  let sourceLabel = "";

  try {
    if (sourceType === "wxr") {
      const file = fd.get("wxrFile");
      if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
        return { ok: false, error: "请选择 WXR 文件" };
      }
      const buf = Buffer.from(await (file as File).arrayBuffer());
      if (buf.length === 0) return { ok: false, error: "文件是空的" };
      const xml = buf.toString("utf8");
      if (!/<item\b/i.test(xml)) {
        return { ok: false, error: "这不像是 WordPress 导出的 WXR 文件" };
      }
      sourceLabel = (file as File).name || "wxr";
      snapshot = parseWxr(xml, { sourceLabel });
    } else if (sourceType === "sql") {
      const file = fd.get("sqlFile");
      if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
        return { ok: false, error: "请选择 MySQL 备份文件" };
      }
      const buf = Buffer.from(await (file as File).arrayBuffer());
      if (buf.length === 0) return { ok: false, error: "文件是空的" };
      sourceLabel = (file as File).name || "backup.sql";
      // 只读文件里的 CREATE / INSERT 语句，不会执行备份里的任何 SQL
      snapshot = scanSqlDumpFile(buf, sourceLabel, { tablePrefix: prefixHint });
    } else {
      const host = String(fd.get("host") ?? "").trim();
      const port = Number(fd.get("port") ?? 3306) || 3306;
      const user = String(fd.get("dbUser") ?? "").trim();
      const password = String(fd.get("dbPass") ?? "");
      const database = String(fd.get("dbName") ?? "").trim();

      if (!host || !user || !database) {
        return { ok: false, error: "请填写数据库地址、账号和库名" };
      }

      sourceLabel = `${database}@${host}:${port}`;
      const pool = await createExternalPool({
        host,
        port,
        user,
        password,
        database,
        ssl: fd.get("ssl") === "1",
      });
      try {
        snapshot = await scanDatabase(pool, { sourceLabel, tablePrefix: prefixHint });
      } finally {
        await pool.end();
      }
    }
  } catch (e) {
    const msg = (e as Error).message || "扫描失败";
    return { ok: false, error: `扫描失败：${msg}` };
  }

  if (snapshot.contents.length === 0) {
    return { ok: false, error: "来源库里没找到可导入的内容（网址/文章/软件）" };
  }

  const jobId = putSnapshot(snapshot);

  const result: ImportScanResult = {
    jobId,
    sourceType: sourceType === "wxr" || sourceType === "sql" ? sourceType : "mysql",
    sourceSystem: snapshot.sourceSystem,
    sourceSystemLabel: SYSTEM_LABEL[snapshot.sourceSystem],
    sourceLabel: snapshot.sourceLabel,
    sourceSiteUrl: snapshot.sourceSiteUrl,
    taxonomies: snapshot.taxonomies,
    categories: snapshot.categories.map((c) => ({
      sourceId: c.sourceId,
      parentSourceId: c.parentSourceId,
      name: c.name,
      count: c.count,
    })),
    contents: snapshot.contents.map((c) => ({
      sourceId: c.sourceId,
      type: c.type,
      title: c.title,
      url: c.url,
      categorySourceId: c.categorySourceId,
      downloadCount: c.downloads.length,
    })),
    stats: {
      categories: snapshot.categories.length,
      contents: snapshot.contents.length,
      sites: snapshot.contents.filter((c) => c.type === "site").length,
      articles: snapshot.contents.filter((c) => c.type === "article").length,
      apps: snapshot.contents.filter((c) => c.type === "app").length,
    },
  };

  return { ok: true, result };
}

/** 执行导入 */
export async function runImportAction(
  fd: FormData
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const admin = await requireAdmin();

  const jobId = String(fd.get("jobId") ?? "");
  const snapshot = getSnapshot(jobId);
  if (!snapshot) {
    return { ok: false, error: "扫描结果已过期，请重新扫描" };
  }

  const categoryIds = String(fd.get("categoryIds") ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  const contentIds = String(fd.get("contentIds") ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));

  if (contentIds.length === 0) {
    return { ok: false, error: "请至少勾选一条要导入的内容" };
  }

  const selection = {
    categoryIds,
    contentIds,
    options: {
      downloads: fd.get("optDownloads") === "1",
      tags: fd.get("optTags") === "1",
      counters: fd.get("optCounters") === "1",
      publishAll: fd.get("optPublishAll") === "1",
      categoryIcons: fd.get("optCategoryIcons") === "1",
    },
  };

  const sourceType = String(fd.get("sourceType") ?? "mysql");
  const sourceLabel = snapshot.sourceLabel;

  await execute(
    `INSERT INTO knav_import_jobs
       (source_type, source_label, source_ref, options, status, message)
     VALUES (?,?,?,?,'running','')`,
    [
      sourceType,
      sourceLabel,
      String(fd.get("sourceRef") ?? ""),
      JSON.stringify(selection),
    ]
  );
  const jobRow = await query<{ id: number }>(
    "SELECT id FROM knav_import_jobs ORDER BY id DESC LIMIT 1"
  );
  const jobId2 = Number(jobRow[0]?.id) || 0;

  try {
    const stats = await runImport(snapshot, selection, sourceLabel);
    const message = `导入 ${stats.contents} 条内容（网址 ${stats.sites} / 文章 ${stats.articles} / 软件 ${stats.apps}）、${stats.categories} 个分类、${stats.downloads} 个平台版本、${stats.mirrors} 条镜像链接`;
    await execute(
      `UPDATE knav_import_jobs SET status = 'success', stats = ?, message = ?, finished_at = NOW() WHERE id = ?`,
      [JSON.stringify(stats), message, jobId2]
    );
    await logAction("import.run", sourceLabel, stats.contents);
    revalidatePath("/admin");
    revalidatePath("/admin/content");
    revalidatePath("/admin/categories");
    revalidatePath("/admin/import");
    return { ok: true, message };
  } catch (e) {
    const msg = (e as Error).message || "导入失败";
    await execute(
      `UPDATE knav_import_jobs SET status = 'failed', message = ?, finished_at = NOW() WHERE id = ?`,
      [`导入失败：${msg}`, jobId2]
    );
    return { ok: false, error: `导入失败：${msg}` };
  }
  void admin;
}

/** 导入历史 */
export async function listImportJobs(): Promise<
  {
    id: number;
    sourceType: string;
    sourceLabel: string;
    status: string;
    message: string;
    createdAt: string;
  }[]
> {
  await requireAdmin();
  const rows = await query<any>(
    `SELECT id, source_type, source_label, status, message, created_at
       FROM knav_import_jobs ORDER BY id DESC LIMIT 30`
  );
  return rows.map((r) => ({
    id: Number(r.id),
    sourceType: String(r.source_type),
    sourceLabel: String(r.source_label),
    status: String(r.status),
    message: String(r.message ?? ""),
    createdAt: String(r.created_at),
  }));
}
