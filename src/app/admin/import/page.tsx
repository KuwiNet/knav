import { listImportJobs } from "@/lib/actions/import-actions";
import ImportManager from "@/components/admin/import-manager";

export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  const history = await listImportJobs();

  return (
    <div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        数据迁移
      </h1>
      <p className="page-sub">
        把其他系统的数据库里的分类与内容导进本站：knav 自有库、WordPress / OneNav、
        Typecho、Z-BlogPHP、Emlog、Halo 1.x，以及带 links / sites 表的通用导航站，
        也支持 WordPress 导出的 WXR 文件。扫描后可以逐项勾选要导入的分类与内容。
      </p>
      <ImportManager history={history} />
    </div>
  );
}
