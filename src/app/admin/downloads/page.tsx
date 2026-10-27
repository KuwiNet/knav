import { listDownloadSoftwares, listAdminContent, countDownloads } from "@/lib/admin";
import { getCategories } from "@/lib/content";
import DownloadManager from "@/components/admin/download-manager";

export const dynamic = "force-dynamic";

export default async function AdminDownloadsPage({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string; contentId?: string }>;
}) {
  const sp = await searchParams;
  const keyword = String(sp.keyword ?? "").trim();
  const contentId = Number(sp.contentId ?? 0) || undefined;

  const [software, apps, stats, categories] = await Promise.all([
    listDownloadSoftwares({ keyword, contentId }),
    listAdminContent({ type: "app", limit: 500 }),
    countDownloads(),
    getCategories(),
  ]);

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        下载管理
      </h1>
      <p className="page-sub">
        按「软件 → 平台版本 → 镜像链接」三层维护：先建软件，再在软件卡片里加 Windows x64 /
        macOS Apple Silicon / Android ARM64 等平台版本，每个平台下可以加官方下载、百度网盘、
        123网盘、App Store、Google Play、App Gallery 等任意多个下载入口。
      </p>

      <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span className="badge badge-accent">{software.length} 个软件</span>
        <span className="badge">{stats.platforms} 个平台版本</span>
        <span className="badge">{stats.mirrors} 个镜像链接</span>
        {keyword ? <span className="badge">搜索：{keyword}</span> : null}
      </div>

      <DownloadManager
        software={software}
        apps={apps.items.map((a) => ({ id: a.id, title: a.title }))}
        categories={categories}
        keyword={keyword}
      />
    </div>
  );
}
