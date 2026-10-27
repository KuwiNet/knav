import { getSettings } from "@/lib/admin";
import { normalizeOrigin } from "@/lib/asset-url";
import { getWallpaper } from "@/lib/wallpaper";
import { SETTING_GROUPS } from "@/lib/settings-config";
import SettingsForm from "@/components/admin/settings-form";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab ?? "";
  const activeTab = SETTING_GROUPS.some((g) => g.key === tab) ? tab : "basic";

  const [settings, wallpaper] = await Promise.all([
    getSettings(),
    getWallpaper().catch(() => null),
  ]);

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        站点设置
      </h1>
      <p className="page-sub">
        配置保存在数据库中，保存后立即生效，无需重启服务。每个分组单独保存，互不覆盖。
      </p>
      <SettingsForm
        settings={settings}
        wallpaperUrl={wallpaper?.url ?? ""}
        siteBase={normalizeOrigin(settings["site_url"])}
        activeTab={activeTab}
      />
    </div>
  );
}
