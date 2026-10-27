// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  require("server-only");
}
import fs from "node:fs/promises";
import path from "node:path";
import { transaction } from "./db";
import { RESET_SCOPE_KEYS } from "./site-reset-config";
import { resetSettingsCache } from "./settings";
import { resetAssetBaseCache } from "./asset-url";
import { resetWallpaperCache } from "./wallpaper";
import { UPLOAD_ROOT } from "./media";

/**
 * 站点重置：按勾选范围清空数据，站长账号与其会话始终保留。
 *
 * 数据库部分在一个事务里完成；上传文件在提交后删（文件系统不参与事务），
 * 删除失败只记日志，不回滚数据。
 */
export async function resetSite(
  scopes: string[]
): Promise<{ ok: boolean; error?: string; cleared: string[]; filesRemoved: boolean }> {
  const picked = scopes.filter((s) => RESET_SCOPE_KEYS.includes(s));
  if (picked.length === 0) {
    return { ok: false, error: "请至少选择一项要清空的数据", cleared: [], filesRemoved: false };
  }
  const has = (key: string) => picked.includes(key);

  try {
    await transaction(async (conn) => {
      if (has("content")) {
        // 收藏指向内容，内容清空后留着会变成悬空记录
        await conn.query("DELETE FROM knav_favorites");
        await conn.query("DELETE FROM knav_content_tags");
        await conn.query("DELETE FROM knav_content_categories");
        await conn.query("DELETE FROM knav_content_links");
        // 软件的平台版本挂在 knav_contents(type=app) 下，必须一起清
        await conn.query("DELETE FROM knav_download_mirrors");
        await conn.query("DELETE FROM knav_downloads");
        await conn.query("DELETE FROM knav_contents");
      }

      if (has("taxonomy")) {
        await conn.query("UPDATE knav_contents SET category_id = 0");
        await conn.query("DELETE FROM knav_content_categories");
        await conn.query("DELETE FROM knav_content_tags");
        await conn.query("DELETE FROM knav_categories");
        await conn.query("DELETE FROM knav_tags");
      }

      if (has("submissions")) {
        await conn.query("DELETE FROM knav_submissions");
      }

      if (has("downloads")) {
        await conn.query("DELETE FROM knav_download_mirrors");
        await conn.query("DELETE FROM knav_downloads");
      }

      if (has("users")) {
        // 只删非站长；站长自己的会话、收藏、通知都不动
        await conn.query(
          "DELETE s FROM knav_sessions s JOIN knav_users u ON u.id = s.user_id WHERE u.role <> 'owner'"
        );
        await conn.query(
          "DELETE f FROM knav_favorites f JOIN knav_users u ON u.id = f.user_id WHERE u.role <> 'owner'"
        );
        await conn.query(
          "DELETE n FROM knav_notifications n JOIN knav_users u ON u.id = n.user_id WHERE u.role <> 'owner'"
        );
        await conn.query(
          "DELETE t FROM knav_email_tokens t JOIN knav_users u ON u.id = t.user_id WHERE u.role <> 'owner'"
        );
        await conn.query(
          "DELETE FROM knav_submissions WHERE user_id IN (SELECT id FROM knav_users WHERE role <> 'owner')"
        );
        await conn.query("DELETE FROM knav_users WHERE role <> 'owner'");
      }

      if (has("media")) {
        await conn.query("DELETE FROM knav_media");
      }

      if (has("messages")) {
        await conn.query("DELETE FROM knav_notifications");
        await conn.query("DELETE FROM knav_mail_log");
      }

      if (has("logs")) {
        await conn.query("DELETE FROM knav_admin_log");
        await conn.query("DELETE FROM knav_import_jobs");
      }

      if (has("settings")) {
        await conn.query("DELETE FROM knav_settings");
      }
    });
  } catch (e: any) {
    return {
      ok: false,
      error: `数据库清理失败，已回滚：${String(e?.message || e)}`,
      cleared: [],
      filesRemoved: false,
    };
  }

  // 设置被清空后，各模块的内存缓存要跟着失效
  if (has("settings")) {
    resetSettingsCache();
    resetAssetBaseCache();
    resetWallpaperCache();
  }

  let filesRemoved = false;
  if (has("media")) {
    const dir = path.join(process.cwd(), "public", UPLOAD_ROOT);
    try {
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(dir, { recursive: true });
      filesRemoved = true;
    } catch (e) {
      console.error("[site-reset] 删除上传文件失败:", e);
    }
  }

  return { ok: true, cleared: picked, filesRemoved };
}
