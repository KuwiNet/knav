import type { Pool } from "mysql2/promise";
import { probeMetaKeys, type MetaKeys } from "./meta-keys";
import {
  absoluteAssetUrl,
  cleanUrl,
  normalizeArch,
  normalizePlatform,
  parseAppDownList,
  parseSpareLinks,
  rewriteRelativeAssets,
  stripTags,
} from "./common";
import type {
  ImportCategory,
  ImportContent,
  ImportContentType,
  ImportSnapshot,
} from "./types";

/**
 * WordPress（OneNav / WebStack / 通用导航站）来源 → 导入快照。
 *
 * 来源可能是两种：
 *   - 直连的 MySQL 源库（loadDataset 用 SQL 读）
 *   - 本地备份文件 .sql / .sql.gz（sql-dump 解析出同样的行数据）
 * 两种都先汇成一份 WpDataset，再由 buildSnapshot 做同一套归一化映射，
 * 免得「在线扫」和「读文件」各写一遍映射规则走偏。
 *
 * 快照内容：
 *   分类 = 所有「分类型」taxonomy 下的 term
 *   内容 = post_type 为 sites / post / app 的 post
 *   附加 = postmeta 里的图标、简介、下载地址、标签
 *
 * 分类轴的归属按内容类型优先匹配 taxonomy：
 *   sites → favorites（OneNav）→ category（通用 WP）
 *   post  → category
 *   app   → apps（OneNav）→ category
 * 匹配不上就退而用该内容挂着的任意分类型 term。
 */

/** 一行来源数据（列名 → 值） */
export type WpRow = Record<string, string | number | null>;

/** WordPress 那套表的内存副本 */
export interface WpDataset {
  prefix: string;
  posts: WpRow[];
  postmeta: WpRow[];
  terms: WpRow[];
  termTaxonomy: WpRow[];
  termRelationships: WpRow[];
  termMeta: WpRow[];
  options: WpRow[];
}

/** 明确是「标签」的 taxonomy，不当作分类 */
const TAG_TAXONOMIES = new Set(["post_tag", "sitetag", "tag", "tags"]);

/** 分类轴的主 taxonomy 优先级（OneNav 把同一批分类镜像到多个 taxonomy） */
const PRIMARY_TAXONOMIES = ["favorites", "apps", "category", "site"];

/** 内容类型 → 优先使用的 taxonomy */
const TAXONOMY_PREFERENCE: Record<ImportContentType, string[]> = {
  site: ["favorites", "sites", "site", "category"],
  article: ["category", "post_category", "article", "favorites"],
  app: ["apps", "app", "category", "favorites"],
};

const POST_TYPE_MAP: Record<string, ImportContentType> = {
  sites: "site",
  site: "site",
  bookmark: "site",
  post: "article",
  article: "article",
  app: "app",
  apps: "app",
  software: "app",
};

/** 算作「内容」的 post_type */
export const CONTENT_POST_TYPES = Object.keys(POST_TYPE_MAP);

/** 这些状态不是给用户看的内容（附件、修订、自动草稿） */
const SKIP_POST_STATUS = ["auto-draft", "inherit", "revision"];

/* ------------------------------------------------------------- 直连源库 */

/** 探测来源库的表前缀 */
export async function detectPrefix(pool: Pool): Promise<string> {
  const [rows] = await pool.query<any[]>(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE '%\\_posts'
      ORDER BY TABLE_NAME`
  );
  const list = rows as any[];
  if (list.length === 0) return "wp_";
  // 优先挑前缀最短的那个（wp_ 而不是 wp_old_）
  list.sort((a, b) => String(a.t).length - String(b.t).length);
  return String(list[0].t).replace(/posts$/, "");
}

/** 从源库读出快照所需的几张表 */
async function loadDataset(pool: Pool, prefix: string): Promise<WpDataset> {
  const [posts] = await pool.query<any[]>(
    `SELECT p.ID, p.post_title, p.post_content, p.post_excerpt, p.post_name,
            p.post_type, p.post_status, p.post_author, p.post_date, p.post_modified,
            p.guid, p.menu_order
       FROM ${prefix}posts p
      WHERE p.post_type IN (${CONTENT_POST_TYPES.map(() => "?").join(",")})
        AND p.post_status NOT IN (${SKIP_POST_STATUS.map(() => "?").join(",")})`,
    [...CONTENT_POST_TYPES, ...SKIP_POST_STATUS]
  );
  const ids = (posts as any[]).map((p) => Number(p.ID));

  const chunk = async (sql: (list: string) => string): Promise<any[]> => {
    if (ids.length === 0) return [];
    const out: any[] = [];
    // 一条 IN 里塞几万个 ID 容易被 max_allowed_packet 卡住，分段查
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500);
      const [rows] = await pool.query(sql(part.map(() => "?").join(",")), part);
      out.push(...(rows as any[]));
    }
    return out;
  };

  const [terms, termTaxonomy, termMeta, options] = await Promise.all([
    pool
      .query<any[]>(`SELECT term_id, name, slug FROM ${prefix}terms`)
      .then((r) => r[0] as any[]),
    pool
      .query<any[]>(
        `SELECT term_taxonomy_id, term_id, taxonomy, parent, count, description
           FROM ${prefix}term_taxonomy`
      )
      .then((r) => r[0] as any[]),
    pool
      .query<any[]>(`SELECT term_id, meta_key, meta_value FROM ${prefix}termmeta`)
      .then((r) => r[0] as any[])
      .catch(() => [] as any[]), // termmeta 只有新版 WP 有，缺了不影响导入
    pool
      .query<any[]>(
        `SELECT option_name, option_value FROM ${prefix}options
          WHERE option_name IN ('siteurl','home','blogname')`
      )
      .then((r) => r[0] as any[])
      .catch(() => [] as any[]),
  ]);

  const postmeta = await chunk(
    (list) => `SELECT post_id, meta_key, meta_value FROM ${prefix}postmeta WHERE post_id IN (${list})`
  );
  const termRelationships = await chunk(
    (list) =>
      `SELECT object_id, term_taxonomy_id FROM ${prefix}term_relationships WHERE object_id IN (${list})`
  );

  return {
    prefix,
    posts: posts as any[],
    postmeta,
    terms,
    termTaxonomy,
    termRelationships,
    termMeta,
    options,
  };
}

/** 扫描直连的源库 */
export async function scanWordPress(
  pool: Pool,
  opts: { sourceLabel?: string } = {}
): Promise<ImportSnapshot> {
  const prefix = await detectPrefix(pool);
  return buildSnapshot(await loadDataset(pool, prefix), opts);
}

/* ------------------------------------------------------------ 快照映射 */

/** 从来源站的 wp_options 里取站点地址（图标等相对路径要靠它补全） */
function detectSiteUrl(options: WpRow[]): string {
  for (const key of ["siteurl", "home"]) {
    const hit = options.find(
      (o) => String(o.option_name) === key && /^https?:\/\//i.test(String(o.option_value ?? ""))
    );
    if (hit) return String(hit.option_value).trim().replace(/\/+$/, "");
  }
  return "";
}

/** 把数据集映射成导入快照 */
export function buildSnapshot(
  ds: WpDataset,
  opts: { sourceLabel?: string } = {}
): ImportSnapshot {
  const metaKeys = probeMetaKeys(ds.postmeta);
  const sourceSiteUrl = detectSiteUrl(ds.options);

  const taxonomies: { name: string; count: number }[] = [];
  {
    const byTax = new Map<string, number>();
    for (const tt of ds.termTaxonomy) {
      const tax = String(tt.taxonomy ?? "");
      if (!tax) continue;
      byTax.set(tax, (byTax.get(tax) ?? 0) + (Number(tt.count) || 0));
    }
    for (const [name, count] of byTax) taxonomies.push({ name, count });
  }

  const categories = buildCategories(ds, metaKeys, sourceSiteUrl);
  const contents = buildContents(ds, metaKeys, categories, sourceSiteUrl);

  return {
    sourceLabel: opts.sourceLabel ?? "",
    sourceSiteUrl,
    categories,
    contents,
    taxonomies,
  };
}

/** 读出所有分类型 taxonomy 下的 term（同一个 term 出现在多个 taxonomy 里只算一个分类） */
function buildCategories(
  ds: WpDataset,
  metaKeys: MetaKeys,
  sourceSiteUrl: string
): ImportCategory[] {
  const termById = new Map<number, WpRow>();
  for (const t of ds.terms) termById.set(Number(t.term_id), t);

  // OneNav 主题里同一个分类会在多个 taxonomy 里各存一份（favorites / category / apps），
  // 合并成一条，主分类法取优先级最高的那个。
  const merged = new Map<
    number,
    {
      name: string;
      slug: string;
      description: string;
      count: number;
      taxonomies: string[];
      parents: number[];
    }
  >();

  for (const tt of ds.termTaxonomy) {
    const tax = String(tt.taxonomy ?? "");
    if (TAG_TAXONOMIES.has(tax)) continue;
    const id = Number(tt.term_id);
    const term = termById.get(id);
    if (!term) continue;

    const hit = merged.get(id) ?? {
      name: String(term.name ?? "").trim(),
      slug: String(term.slug ?? "").trim(),
      description: stripTags(String(tt.description ?? "")),
      count: 0,
      taxonomies: [],
      parents: [],
    };
    hit.taxonomies.push(tax);
    hit.parents.push(Number(tt.parent) || 0);
    hit.count = Math.max(hit.count, Number(tt.count) || 0);
    merged.set(id, hit);
  }

  // OneNav 把图标存在 termmeta 里（_thumbnail / _icon）
  const iconKeys = new Set([metaKeys.siteIcon, "_thumbnail", "_icon", "icon", "_cat_icon"]);
  const iconByTerm = new Map<number, string>();
  for (const m of ds.termMeta) {
    if (!iconKeys.has(String(m.meta_key))) continue;
    const id = Number(m.term_id);
    if (!iconByTerm.has(id)) iconByTerm.set(id, String(m.meta_value ?? "").trim());
  }

  const out: ImportCategory[] = [];
  for (const [id, m] of merged) {
    // 主分类法：优先 favorites（OneNav 的统一分类轴），其次 apps / category
    const primary = PRIMARY_TAXONOMIES.find((t) => m.taxonomies.includes(t));
    const idx = primary ? m.taxonomies.indexOf(primary) : 0;
    out.push({
      sourceId: id,
      parentSourceId: m.parents[idx] ?? 0,
      name: m.name,
      slug: m.slug,
      description: m.description,
      icon: absoluteAssetUrl(iconByTerm.get(id) ?? "", sourceSiteUrl),
      count: m.count,
    });
  }
  return out;
}

/** 读出所有内容及其 meta */
function buildContents(
  ds: WpDataset,
  metaKeys: MetaKeys,
  categories: ImportCategory[],
  sourceSiteUrl: string
): ImportContent[] {
  const metaByPost = new Map<number, Map<string, string>>();
  for (const m of ds.postmeta) {
    const pid = Number(m.post_id);
    if (!metaByPost.has(pid)) metaByPost.set(pid, new Map());
    const hit = metaByPost.get(pid)!;
    const key = String(m.meta_key);
    if (!hit.has(key)) hit.set(key, String(m.meta_value ?? ""));
  }

  // 分类关联：term_relationships → term_taxonomy → terms
  const taxByTtId = new Map<number, WpRow>();
  for (const tt of ds.termTaxonomy) taxByTtId.set(Number(tt.term_taxonomy_id), tt);
  const termById = new Map<number, WpRow>();
  for (const t of ds.terms) termById.set(Number(t.term_id), t);

  const termsByPost = new Map<number, { taxonomy: string; term_id: number; name: string }[]>();
  for (const rel of ds.termRelationships) {
    const tt = taxByTtId.get(Number(rel.term_taxonomy_id));
    if (!tt) continue;
    const term = termById.get(Number(tt.term_id));
    if (!term) continue;
    const pid = Number(rel.object_id);
    if (!termsByPost.has(pid)) termsByPost.set(pid, []);
    termsByPost.get(pid)!.push({
      taxonomy: String(tt.taxonomy ?? ""),
      term_id: Number(tt.term_id),
      name: String(term.name ?? ""),
    });
  }

  const catSourceIds = new Set(categories.map((c) => c.sourceId));
  const out: ImportContent[] = [];

  for (const p of ds.posts) {
    const postType = String(p.post_type ?? "");
    if (!POST_TYPE_MAP[postType]) continue;
    const status = String(p.post_status ?? "publish");
    if (SKIP_POST_STATUS.includes(status)) continue;

    const id = Number(p.ID);
    const type = POST_TYPE_MAP[postType];
    const meta = metaByPost.get(id) ?? new Map<string, string>();

    const pick = (...keys: string[]): string => {
      for (const k of keys) {
        const v = meta.get(k);
        if (v !== undefined && v !== "") return v;
      }
      return "";
    };

    // 标题：post_title 为空时退回正文首行
    let title = String(p.post_title ?? "").trim();
    if (!title) {
      const body = stripTags(String(p.post_content ?? ""));
      title = body.slice(0, 80);
    }

    // 网址：优先 OneNav 的 _sites_link，其次通用导航站的字段，最后用 guid
    let url = cleanUrl(
      pick(
        metaKeys.siteUrl,
        "_sites_link",
        "url",
        "_url",
        "link",
        "external_url",
        "_external_url",
        "website",
        "site_url",
        "_target_url",
        "target_url",
        "download_url"
      )
    );
    if (!url && type === "site") url = cleanUrl(String(p.guid ?? ""));

    const description = stripTags(
      pick(
        metaKeys.siteDesc,
        metaKeys.appDesc,
        "_sites_sescribe",
        "_app_sescribe",
        "description",
        "_description",
        "excerpt",
        "_excerpt"
      )
    ).slice(0, 900);

    const icon = absoluteAssetUrl(
      pick(
        metaKeys.siteIcon,
        metaKeys.appIcon,
        "_thumbnail",
        "_app_ico",
        "icon",
        "_icon",
        "favicon",
        "_favicon",
        "logo",
        "_logo"
      ),
      sourceSiteUrl
    );

    const cover = absoluteAssetUrl(
      pick(
        metaKeys.sitePreview,
        metaKeys.downPreview,
        "_sites_preview",
        "_down_preview",
        "cover",
        "_cover",
        "thumbnail"
      ),
      sourceSiteUrl
    );

    const contentMd =
      type === "article" ? rewriteRelativeAssets(String(p.post_content ?? ""), sourceSiteUrl) : "";

    // 分类：按类型优先的 taxonomy 挑
    const linked = (termsByPost.get(id) ?? []).filter((t) => catSourceIds.has(t.term_id));
    const preferred = TAXONOMY_PREFERENCE[type];
    let categorySourceId = 0;
    for (const tax of preferred) {
      const hit = linked.find((t) => t.taxonomy === tax);
      if (hit) {
        categorySourceId = hit.term_id;
        break;
      }
    }
    if (!categorySourceId && linked.length > 0) categorySourceId = linked[0].term_id;

    // 标签：标签型 taxonomy 下的 term 名
    const tags = (termsByPost.get(id) ?? [])
      .filter((t) => TAG_TAXONOMIES.has(t.taxonomy))
      .map((t) => t.name.trim())
      .filter(Boolean);

    // 下载：OneNav 把平台版本存在 app_down_list 里
    const downloads: ImportContent["downloads"] = [];
    if (type === "app") {
      const raw = pick(metaKeys.appDownList, "app_down_list", "_app_versions");
      if (raw) {
        for (const d of parseAppDownList(raw)) {
          downloads.push({
            platform: d.platform,
            arch: d.arch,
            version: d.version,
            fileSize: d.fileSize,
            note: d.note,
            mirrors: d.mirrors,
          });
        }
      }
      // 没有 app_down_list 时，退回用「平台 + 版本 + 正式地址」凑一条
      if (downloads.length === 0) {
        const platform = normalizePlatform(pick(metaKeys.appPlatform, "_app_platform", "platform"));
        const version = pick(metaKeys.downVersion, "_down_version", "version");
        const formal = cleanUrl(pick(metaKeys.downFormal, "_down_formal", "homepage"));
        const direct = cleanUrl(pick(metaKeys.downUrlList, "_down_url_list", "download_url"));
        if (platform || version || formal || direct) {
          const mirrors = [];
          if (direct) {
            mirrors.push({
              name: "官方下载",
              url: direct,
              fileSize: pick(metaKeys.downSize, "_down_size", "file_size"),
              note: "",
            });
          }
          if (formal) mirrors.push({ name: "官网", url: formal, fileSize: "", note: "" });
          downloads.push({
            platform,
            arch: normalizeArch(pick("arch", "architecture", "_arch")),
            version,
            fileSize: pick(metaKeys.downSize, "_down_size", "file_size"),
            note: "",
            mirrors,
          });
        }
      }
    }

    // 备用链接
    const links: ImportContent["links"] = [];
    const spare = pick(metaKeys.spareLinks, "_spare_sites_link");
    if (spare) links.push(...parseSpareLinks(spare));

    const views = Number(pick(metaKeys.views, "views", "post_views_count")) || 0;
    const likes = Number(pick(metaKeys.likes, "_like_count", "post_like")) || 0;

    out.push({
      sourceId: id,
      type,
      title,
      url,
      description,
      contentMd,
      icon,
      cover,
      categorySourceId,
      tags,
      views,
      likes,
      sticky: Number(p.sticky) || 0,
      sortOrder: Number(p.menu_order) || 0,
      status,
      createdAt: String(p.post_date ?? ""),
      updatedAt: String(p.post_modified ?? p.post_date ?? ""),
      downloads,
      links,
    });
  }

  return out;
}
