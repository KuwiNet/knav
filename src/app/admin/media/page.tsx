import { listMedia, scanUploadsToMedia } from "@/lib/media";
import MediaManager from "@/components/admin/media-manager";
import { Pagination } from "@/components/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const keyword = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  let { items, total } = await listMedia({ keyword, limit: PAGE_SIZE, offset });

  // 素材库是空的时候先扫一遍 uploads：从备份恢复图片后不必再手动点按钮
  if (!keyword && page === 1 && total === 0) {
    const scanned = await scanUploadsToMedia();
    if (scanned.added > 0) {
      ({ items, total } = await listMedia({ limit: PAGE_SIZE }));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        素材库
      </h1>
      <p className="page-sub">
        上传图片、把外链图片下载到本地。后台保存网址/文章时填写的远程图片地址也会自动本地化。
      </p>
      <MediaManager items={items} total={total} keyword={keyword} />
      {totalPages > 1 ? (
        <Pagination
          current={page}
          totalPages={totalPages}
          basePath="/admin/media"
          extraParams={keyword ? { q: keyword } : {}}
        />
      ) : null}
    </div>
  );
}
