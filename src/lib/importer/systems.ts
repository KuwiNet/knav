import { looksLikeCategoryTable, looksLikeLinkTable } from "./tables";
import type { ImportSourceSystem } from "./types";

/**
 * 来源库识别。
 *
 * 各系统的表名特征：
 *   knav      *_content_categories / *_download_mirrors
 *   WordPress *_posts + *_terms / *_term_taxonomy
 *   Typecho   *_contents + *_metas + *_relationships
 *   Z-Blog    *_post + *_category + *_tag
 *   Emlog     *_blog + *_sort
 *   Halo 1.x  不带前缀的 posts + post_categories
 *   通用导航   links / sites / bookmarks（可带分类表）
 *
 * Halo 2.x 把内容塞进 extensions 表的 JSON 里，没有可供映射的内容表，单独提示。
 */

export type SourceSystem = ImportSourceSystem | "halo2" | "unknown";

export interface SourceDetection {
  system: SourceSystem;
  /** 表前缀（WordPress 的 wp_、Typecho 的 typecho_…；Halo 为空串） */
  prefix: string;
  /** 通用导航库用到的链接表 / 分类表 */
  linkTable?: string;
  categoryTable?: string;
}

export function unsupportedSourceMessage(names: string[]): string {
  const sample = names.slice(0, 8).join("、");
  const more = names.length > 8 ? ` 等 ${names.length} 张表` : "";
  return (
    `没认出受支持的数据库${sample ? `（读到：${sample}${more}）` : ""}。` +
    "目前支持 knav、WordPress / OneNav、Typecho、Z-BlogPHP、Emlog、Halo 1.x，以及带 links / sites 表的导航库。"
  );
}

export const SYSTEM_LABEL: Record<ImportSourceSystem, string> = {
  knav: "knav 自有数据库",
  wordpress: "WordPress / OneNav",
  typecho: "Typecho",
  zblog: "Z-BlogPHP",
  emlog: "Emlog",
  halo: "Halo 1.x",
  links: "通用导航库（links）",
};

interface NameIndex {
  names: string[];
  lower: Map<string, string>;
}

function indexNames(names: string[]): NameIndex {
  const lower = new Map<string, string>();
  for (const n of names) {
    const key = n.toLowerCase();
    if (!lower.has(key)) lower.set(key, n);
  }
  return { names, lower };
}

function has(idx: NameIndex, name: string): boolean {
  return idx.lower.has(name.toLowerCase());
}

function orig(idx: NameIndex, name: string): string {
  return idx.lower.get(name.toLowerCase()) ?? name;
}

/** 探测一次：preferredPrefix 给了就先只看这个前缀，认不出来再退回全库探测 */
export function detectSourceSystem(
  tableNames: string[],
  preferredPrefix = "",
  counts?: Record<string, number>
): SourceDetection {
  const idx = indexNames(tableNames);
  const preferred = preferredPrefix.trim();

  if (preferred) {
    const hit = detect(idx, preferred, counts);
    if (hit.system !== "unknown") return hit;
  }
  return detect(idx, "", counts);
}

function detect(
  idx: NameIndex,
  preferred: string,
  counts?: Record<string, number>
): SourceDetection {
  const prefer = preferred.toLowerCase();
  const allows = (prefix: string) =>
    !prefer || prefix.toLowerCase() === prefer;

  /* ------------------------------------------------------------- knav */
  for (const name of idx.names) {
    if (!/content_categories$/i.test(name)) continue;
    const prefix = name.slice(0, name.length - "content_categories".length);
    if (!allows(prefix)) continue;
    if (has(idx, `${prefix}contents`) && has(idx, `${prefix}categories`)) {
      return { system: "knav", prefix };
    }
  }

  /* -------------------------------------------------------- WordPress */
  const wp: { prefix: string; rows: number }[] = [];
  for (const name of idx.names) {
    if (!/posts$/i.test(name)) continue;
    const prefix = name.slice(0, name.length - "posts".length);
    if (!allows(prefix)) continue;
    if (
      has(idx, `${prefix}term_taxonomy`) ||
      has(idx, `${prefix}terms`) ||
      has(idx, `${prefix}postmeta`)
    ) {
      wp.push({
        prefix,
        rows: counts?.[name] ?? counts?.[name.toLowerCase()] ?? 0,
      });
    }
  }
  if (wp.length > 0) {
    wp.sort((a, b) => b.rows - a.rows || a.prefix.length - b.prefix.length);
    return { system: "wordpress", prefix: wp[0].prefix };
  }

  /* ----------------------------------------------------------- Typecho */
  for (const name of idx.names) {
    if (!/contents$/i.test(name)) continue;
    const prefix = name.slice(0, name.length - "contents".length);
    if (!allows(prefix)) continue;
    if (
      has(idx, `${prefix}metas`) &&
      (has(idx, `${prefix}relationships`) || has(idx, `${prefix}fields`))
    ) {
      return { system: "typecho", prefix };
    }
  }

  /* ------------------------------------------------------------ Z-Blog */
  for (const name of idx.names) {
    if (!/post$/i.test(name) || /posts$/i.test(name)) continue;
    const prefix = name.slice(0, name.length - "post".length);
    if (!allows(prefix)) continue;
    if (
      has(idx, `${prefix}category`) &&
      (has(idx, `${prefix}tag`) || has(idx, `${prefix}config`))
    ) {
      return { system: "zblog", prefix };
    }
  }

  /* ------------------------------------------------------------- Emlog */
  for (const name of idx.names) {
    if (!/blog$/i.test(name)) continue;
    const prefix = name.slice(0, name.length - "blog".length);
    if (!allows(prefix)) continue;
    if (has(idx, `${prefix}sort`) || has(idx, `${prefix}link`)) {
      return { system: "emlog", prefix };
    }
  }

  /* --------------------------------------------------------- Halo 1.x */
  if (
    !prefer &&
    has(idx, "posts") &&
    (has(idx, "post_categories") || has(idx, "categories")) &&
    !has(idx, "term_taxonomy")
  ) {
    return { system: "halo", prefix: "" };
  }

  /* ----------------------------------------------------- 通用导航 links */
  if (!prefer) {
    const links = idx.names
      .filter((n) => looksLikeLinkTable(n))
      .sort((a, b) => linkScore(b) - linkScore(a) || a.length - b.length);
    if (links.length > 0) {
      const categoryTable = idx.names.find((n) => looksLikeCategoryTable(n));
      return {
        system: "links",
        prefix: "",
        linkTable: orig(idx, links[0]),
        categoryTable: categoryTable ? orig(idx, categoryTable) : undefined,
      };
    }

    if (has(idx, "extensions")) return { system: "halo2", prefix: "" };
  }

  return { system: "unknown", prefix: "" };
}

function linkScore(name: string): number {
  const base = name.toLowerCase().split(".").pop() ?? "";
  if (base === "links") return 5;
  if (base === "sites") return 4;
  if (base === "link") return 3;
  if (base.endsWith("_links")) return 2;
  return 1;
}

/** 该来源需要读取的表（只返回库里确实存在的） */
export function wantedTables(det: SourceDetection, tableNames: string[]): string[] {
  const idx = indexNames(tableNames);
  const out: string[] = [];
  const add = (name: string) => {
    if (!has(idx, name)) return;
    const real = orig(idx, name);
    if (!out.includes(real)) out.push(real);
  };

  switch (det.system) {
    case "wordpress": {
      const p = det.prefix;
      for (const s of [
        "posts",
        "postmeta",
        "terms",
        "term_taxonomy",
        "term_relationships",
        "termmeta",
        "options",
      ]) {
        add(`${p}${s}`);
      }
      break;
    }
    case "knav": {
      const p = det.prefix;
      for (const s of [
        "categories",
        "contents",
        "content_categories",
        "tags",
        "content_tags",
        "content_links",
        "downloads",
        "download_mirrors",
        "settings",
      ]) {
        add(`${p}${s}`);
      }
      break;
    }
    case "typecho": {
      const p = det.prefix;
      for (const s of ["contents", "metas", "relationships", "options", "fields", "links"]) {
        add(`${p}${s}`);
      }
      break;
    }
    case "zblog": {
      const p = det.prefix;
      for (const s of ["post", "category", "tag", "module", "config"]) {
        add(`${p}${s}`);
      }
      break;
    }
    case "emlog": {
      const p = det.prefix;
      for (const s of ["blog", "sort", "tag", "link", "options"]) {
        add(`${p}${s}`);
      }
      break;
    }
    case "halo": {
      for (const s of [
        "posts",
        "contents",
        "categories",
        "tags",
        "post_categories",
        "post_tags",
        "links",
        "options",
      ]) {
        add(s);
      }
      break;
    }
    case "links": {
      if (det.linkTable) add(det.linkTable);
      if (det.categoryTable) add(det.categoryTable);
      for (const name of tableNames) {
        if (/(?:^|_)(?:options?|config|settings)$/i.test(name)) {
          add(name);
          break;
        }
      }
      break;
    }
    default:
      break;
  }
  return out;
}
