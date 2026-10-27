import { listAdminContent } from "@/lib/admin";
import { getCategories } from "@/lib/content";
import { Pagination } from "@/components/pagination";
import ContentManager from "@/components/admin/content-manager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    type?: string;
    keyword?: string;
    categoryId?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const type = sp.type ?? "";
  const keyword = sp.keyword ?? "";
  const categoryId = Number(sp.categoryId ?? 0) || 0;

  const [{ items, total }, categories] = await Promise.all([
    listAdminContent({
      type: type || undefined,
      keyword: keyword || undefined,
      categoryId: categoryId || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getCategories(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        内容管理
      </h1>
      <p className="page-sub">
        共 {total} 条内容。可新增、编辑、置顶、排序、调整分类、批量操作。
        {categoryId ? "（已按分类筛选）" : ""}
      </p>

      <ContentManager
        items={items}
        categories={categories}
        type={type}
        keyword={keyword}
        categoryId={categoryId}
      />

      {totalPages > 1 ? (
        <Pagination
          current={page}
          totalPages={totalPages}
          basePath="/admin/content"
          extraParams={{
            ...(type ? { type } : {}),
            ...(keyword ? { keyword } : {}),
            ...(categoryId ? { categoryId: String(categoryId) } : {}),
          }}
        />
      ) : null}
    </div>
  );
}
