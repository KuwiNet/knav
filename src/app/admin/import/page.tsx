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
        把 WordPress（含 OneNav / WebStack 等导航站主题）或导出的 WXR
        文件里的内容导进本站。扫描后可以逐项勾选要导入的分类与内容。
      </p>
      <ImportManager history={history} />
    </div>
  );
}
