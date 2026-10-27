import { getCategories } from "@/lib/content";
import CategoryManager from "@/components/admin/category-manager";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await getCategories();

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        分类管理
      </h1>
      <p className="page-sub">
        网址与文章共用同一套分类，修改后前台立即生效。
      </p>
      <CategoryManager categories={categories} />
    </div>
  );
}
