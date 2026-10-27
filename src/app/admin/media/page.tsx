import { listMedia, scanUploadsToMedia } from "@/lib/media";
import MediaManager from "@/components/admin/media-manager";

export const dynamic = "force-dynamic";

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const keyword = (sp.q ?? "").trim();
  let { items, total } = await listMedia({ keyword, limit: 60 });

  // 素材库是空的时候先扫一遍 uploads：从备份恢复图片后不必再手动点按钮
  if (!keyword && total === 0) {
    const scanned = await scanUploadsToMedia();
    if (scanned.added > 0) {
      ({ items, total } = await listMedia({ limit: 60 }));
    }
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        素材库
      </h1>
      <p className="page-sub">
        上传图片、把外链图片下载到本地。后台保存网址/文章时填写的远程图片地址也会自动本地化。
      </p>
      <MediaManager items={items} total={total} keyword={keyword} />
    </div>
  );
}
