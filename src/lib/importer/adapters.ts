import { buildEmlogSnapshot } from "./emlog";
import { buildHaloSnapshot } from "./halo";
import { buildKnavSnapshot } from "./knav";
import { buildLinksSnapshot } from "./links";
import { tableRows, type TableMap } from "./tables";
import { buildTypechoSnapshot } from "./typecho";
import { buildZblogSnapshot } from "./zblog";
import { buildSnapshot, type WpDataset, type WpRow } from "./wordpress";
import type { SourceDetection } from "./systems";
import type { ImportSnapshot } from "./types";

/** 按识别结果把原始表映射成统一的导入快照 */
export function buildSnapshotFromTables(
  det: SourceDetection,
  tables: TableMap,
  opts: { sourceLabel?: string } = {}
): ImportSnapshot {
  switch (det.system) {
    case "knav":
      return buildKnavSnapshot(tables, det.prefix, opts);

    case "typecho":
      return buildTypechoSnapshot(tables, det.prefix, opts);

    case "zblog":
      return buildZblogSnapshot(tables, det.prefix, opts);

    case "emlog":
      return buildEmlogSnapshot(tables, det.prefix, opts);

    case "halo":
      return buildHaloSnapshot(tables, opts);

    case "links": {
      if (!det.linkTable) throw new Error("没有找到可导入的链接表");
      return buildLinksSnapshot(tables, { ...opts, linkTable: det.linkTable, categoryTable: det.categoryTable });
    }

    case "wordpress": {
      const p = det.prefix;
      const ds: WpDataset = {
        prefix: p,
        posts: tableRows(tables, `${p}posts`) as WpRow[],
        postmeta: tableRows(tables, `${p}postmeta`) as WpRow[],
        terms: tableRows(tables, `${p}terms`) as WpRow[],
        termTaxonomy: tableRows(tables, `${p}term_taxonomy`) as WpRow[],
        termRelationships: tableRows(tables, `${p}term_relationships`) as WpRow[],
        termMeta: tableRows(tables, `${p}termmeta`) as WpRow[],
        options: tableRows(tables, `${p}options`) as WpRow[],
      };
      return buildSnapshot(ds, opts);
    }

    default:
      throw new Error("暂不支持这个来源系统的数据格式");
  }
}
