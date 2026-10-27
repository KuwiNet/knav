// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  require("server-only");
}
import { query, queryOne, execute } from "./db";
import {
  WALLPAPER_MASKS,
  WALLPAPER_REFRESHES,
  WALLPAPER_SOURCES,
  WALLPAPER_360_CIDS,
  WALLPAPER_360_DEFAULT_CIDS,
  type Wallpaper,
  type WallpaperMask,
  type WallpaperRefresh,
  type WallpaperSettings,
  type WallpaperSource,
  type WallpaperVariant,
} from "./wallpaper-config";

/**
 * 站点壁纸。
 *
 * 后台「站点设置 → 站点壁纸」里选择来源，服务端解析成一张具体的图片地址，
 * 前台把它铺成整页背景。取壁纸失败时退回上一次成功的地址，
 * 不会因为第三方接口挂掉而白屏。
 *
 * 「小鸟壁纸」走 360 的壁纸分类接口：随机挑一个勾选的分类 + 随机偏移取一张，
 * 同一张图还能按尺寸档取（见 buildVariants），由浏览器按屏幕挑，小屏不下载大图。
 */

export type { Wallpaper, WallpaperMask, WallpaperSettings, WallpaperSource };

const DEFAULT_SETTINGS: WallpaperSettings = {
  source: "none",
  customUrl: "",
  mask: "normal",
  refresh: "daily",
  cids: WALLPAPER_360_DEFAULT_CIDS,
};

/** 解析结果缓存有效期（毫秒） */
const CACHE_TTL = 30 * 60 * 1000;

/** 每次刷新一张时一次批量取回多少张：批量取是为了不让每个请求都去等接口 */
const BATCH_SIZE = 20;

/** 分类总量没查过之前，随机偏移先在这个范围内取（实测最小的分类也有 3500+ 张） */
const SAFE_START_RANGE = 3000;

/** 「每天一张」当天的解析结果落库，跨进程/重启/缓存过期都保持同一张 */
const DAILY_KEY = "wallpaper_daily";

interface Resolved {
  url: string;
  title: string;
  link: string;
  variants: WallpaperVariant[];
}

interface DailyRecord {
  day: string;
  cids: string;
  resolved: Resolved;
}

let cache: { key: string; resolved: Resolved; at: number } | null = null;

/** 同一天并发请求时只解析一次，避免多个请求各抽一张、最后一张覆盖前一张 */
let dailyInFlight: { key: string; promise: Promise<Resolved | null> } | null = null;

/** 「每次刷新一张」用的内存池：一批取回 20 张，逐个往下发，发完或过期再补 */
let batch: { items: Resolved[]; cursor: number; at: number } | null = null;

/** 每个分类的图片总数，接口返回过就记住，用来算随机偏移的上界 */
const totalByCid = new Map<number, number>();

/** 设置变更后清缓存（保存站点壁纸设置后调用） */
export function resetWallpaperCache(): void {
  cache = null;
  batch = null;
  dailyInFlight = null;
}

/** 读取壁纸设置 */
export async function getWallpaperSettings(): Promise<WallpaperSettings> {
  const rows = await query<{ name: string; value: string }>(
    `SELECT name, value FROM knav_settings
     WHERE name IN ('wallpaper_source','wallpaper_custom','wallpaper_mask','wallpaper_refresh','wallpaper_cids')`
  );
  const map = new Map(rows.map((r) => [r.name, r.value ?? ""]));
  const source = map.get("wallpaper_source") as WallpaperSource;
  const mask = map.get("wallpaper_mask") as WallpaperMask;
  const refresh = map.get("wallpaper_refresh") as WallpaperRefresh;
  return {
    source: WALLPAPER_SOURCES.some((s) => s.value === source) ? source : DEFAULT_SETTINGS.source,
    customUrl: map.get("wallpaper_custom") ?? "",
    mask: WALLPAPER_MASKS.some((m) => m.value === mask) ? mask : DEFAULT_SETTINGS.mask,
    refresh: WALLPAPER_REFRESHES.some((r) => r.value === refresh)
      ? refresh
      : DEFAULT_SETTINGS.refresh,
    cids: parseCids(map.get("wallpaper_cids")),
  };
}

/** 后台勾选的分类编号；只认已知的那几个，一个都没勾（或存脏值）时按全部分类来 */
function parseCids(raw: string | undefined | null): number[] {
  const picked = (raw ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => WALLPAPER_360_CIDS.some((c) => c.cid === n));
  return picked.length > 0 ? [...new Set(picked)] : WALLPAPER_360_DEFAULT_CIDS;
}

/** 今天日期（每天一张按它做缓存 key，跨天自然换新图） */
function dayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 取得当前壁纸（没有启用时返回 null） */
export async function getWallpaper(cfg?: WallpaperSettings): Promise<Wallpaper | null> {
  const conf = cfg ?? (await getWallpaperSettings().catch(() => DEFAULT_SETTINGS));

  if (conf.source === "none") return null;

  if (conf.source === "custom") {
    const url = conf.customUrl.trim();
    if (!url) return null;
    return { url, source: "custom", title: "自定义壁纸", link: "", variants: [] };
  }

  const source = conf.source;
  const resolved =
    source === "xiaoniao" && conf.refresh === "each_view"
      ? await pickFromBatch(conf)
      : await cachedResolve(source, conf);

  if (resolved) {
    // 落库，接口临时挂掉时还能继续用
    await execute(
      `INSERT INTO knav_settings (name, value) VALUES ('wallpaper_resolved', ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP`,
      [resolved.url]
    ).catch(() => undefined);
    return { ...resolved, source };
  }

  // 取不到：退回上次成功解析出来的地址
  const fallback = await queryOne<{ value: string }>(
    "SELECT value FROM knav_settings WHERE name = 'wallpaper_resolved' LIMIT 1"
  ).catch(() => null);
  if (fallback?.value) {
    return { url: fallback.value, source, title: "壁纸", link: "", variants: [] };
  }
  return null;
}

/** 每天一张（以及 Bing / 随机风景）：按 key 命中缓存就直接用 */
async function cachedResolve(
  source: Exclude<WallpaperSource, "none" | "custom">,
  conf: WallpaperSettings
): Promise<Resolved | null> {
  const daily = source === "xiaoniao" && conf.refresh === "daily";
  const key = daily ? `xiaoniao:${dayKey()}:${cidSignature(conf)}` : source;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_TTL) {
    return cache.resolved;
  }
  try {
    const resolved = daily
      ? await resolveDaily(conf, key)
      : await resolveBySource(source, conf);
    if (resolved) {
      cache = { key, resolved, at: Date.now() };
      return resolved;
    }
  } catch {
    /* 取壁纸失败不影响页面 */
  }
  return null;
}

/** 小鸟壁纸「每天一张」：先看当天落库的结果，没有才抽一张并记下来 */
async function resolveDaily(
  conf: WallpaperSettings,
  key: string
): Promise<Resolved | null> {
  const saved = await readDaily(conf);
  if (saved) return saved;

  let task = dailyInFlight;
  if (!task || task.key !== key) {
    const entry: { key: string; promise: Promise<Resolved | null> } = {
      key,
      promise: resolveBySource("xiaoniao", conf),
    };
    dailyInFlight = entry;
    entry.promise
      .finally(() => {
        if (dailyInFlight === entry) dailyInFlight = null;
      })
      .catch(() => undefined);
    task = entry;
  }

  const resolved = await task.promise.catch(() => null);
  if (resolved) await writeDaily(conf, resolved);
  return resolved;
}

function cidSignature(conf: WallpaperSettings): string {
  return [...conf.cids].sort((a, b) => a - b).join(",");
}

async function readDaily(conf: WallpaperSettings): Promise<Resolved | null> {
  const row = await queryOne<{ value: string }>(
    "SELECT value FROM knav_settings WHERE name = ? LIMIT 1",
    [DAILY_KEY]
  ).catch(() => null);
  if (!row?.value) return null;
  try {
    const rec = JSON.parse(row.value) as DailyRecord;
    if (rec?.day !== dayKey() || rec.cids !== cidSignature(conf)) return null;
    const r = rec.resolved;
    if (!r?.url) return null;
    return {
      url: r.url,
      title: r.title || "小鸟壁纸",
      link: r.link || "",
      variants: Array.isArray(r.variants) ? r.variants : [],
    };
  } catch {
    return null;
  }
}

async function writeDaily(
  conf: WallpaperSettings,
  resolved: Resolved
): Promise<void> {
  const rec: DailyRecord = {
    day: dayKey(),
    cids: cidSignature(conf),
    resolved,
  };
  await execute(
    `INSERT INTO knav_settings (name, value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP`,
    [DAILY_KEY, JSON.stringify(rec)]
  ).catch(() => undefined);
}

/** 每次刷新一张：从内存池轮流发，池空了才打一次接口补一批 */
async function pickFromBatch(conf: WallpaperSettings): Promise<Resolved | null> {
  let pool = batch;
  if (!pool || Date.now() - pool.at > CACHE_TTL || pool.cursor >= pool.items.length) {
    const items = await fetch360Batch(conf, BATCH_SIZE).catch(() => [] as Resolved[]);
    if (items.length === 0) return null;
    pool = { items: shuffle(items), cursor: 0, at: Date.now() };
    batch = pool;
  }
  const item = pool.items[pool.cursor];
  pool.cursor += 1;
  return item ?? null;
}

function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 按来源解析出具体图片地址 */
async function resolveBySource(
  source: Exclude<WallpaperSource, "none" | "custom">,
  conf: WallpaperSettings
): Promise<Resolved | null> {
  if (source === "xiaoniao") {
    const items = await fetch360Batch(conf, 1);
    return items[0] ?? null;
  }

  if (source === "bing") {
    const data = await fetchJson(
      "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN"
    );
    const img = data?.images?.[0];
    if (!img?.url) return null;
    const raw = String(img.url);
    const url = raw.startsWith("//")
      ? `https:${raw}`
      : raw.startsWith("http")
        ? raw
        : `https://www.bing.com${raw}`;
    return {
      url,
      title: String(img.copyright ?? "Bing 每日壁纸"),
      link: String(img.copyrightLink ?? "https://www.bing.com"),
      variants: [],
    };
  }

  if (source === "random") {
    return {
      url: "https://picsum.photos/1920/1080",
      title: "随机风景",
      link: "https://picsum.photos/",
      variants: [],
    };
  }

  return null;
}

/** 360 壁纸分类接口（这个域名只有 http，证书不覆盖主机名，所以走 http 取 JSON） */
const API_360 = "http://wallpaper.apc.360.cn/index.php";

/**
 * 从勾选的分类里随机取 count 张。
 *
 * start 是偏移量，超出该分类总数就返回空数组，所以先用记下过（没记过就保守取）的
 * 上界算偏移；真的取空了退回 start=0 再试一次。
 */
async function fetch360Batch(
  conf: WallpaperSettings,
  count: number
): Promise<Resolved[]> {
  const cid = conf.cids[Math.floor(Math.random() * conf.cids.length)];
  const start = randomStart(cid, count);

  const first = await fetchJson(`${API_360}?c=WallPaper&a=getAppsByCategory&from=360chrome&count=${count}&cid=${cid}&start=${start}`);
  let list: any[] = first?.data ?? [];
  if (list.length === 0 && start !== 0) {
    // 偏移超界（这个分类其实没那么多图）：从头取，顺带把总数记下来
    const retry = await fetchJson(`${API_360}?c=WallPaper&a=getAppsByCategory&from=360chrome&count=${count}&cid=${cid}&start=0`);
    list = retry?.data ?? [];
    rememberTotal(cid, retry?.total);
  } else {
    rememberTotal(cid, first?.total);
  }

  return list.map(toResolved).filter((r): r is Resolved => !!r);
}

function rememberTotal(cid: number, total: unknown): void {
  const n = Number(total);
  if (Number.isFinite(n) && n > 0) totalByCid.set(cid, n);
}

function randomStart(cid: number, count: number): number {
  const total = totalByCid.get(cid) ?? 0;
  const upper = total > count ? total - count : SAFE_START_RANGE;
  return Math.floor(Math.random() * upper);
}

/** 图床地址 → 解析结果（默认给中间档，小屏由浏览器换更小的档） */
function toResolved(item: any): Resolved | null {
  const raw = String(item?.url ?? "").trim();
  if (!raw) return null;
  const variants = buildVariants(raw);
  const url =
    variants.find((v) => v.px === 1600 && !v.portrait)?.url ??
    variants.find((v) => !v.portrait)?.url ??
    toHttps(raw);
  return { url, title: titleOf(item), link: toHttps(raw), variants };
}

/** 360 图床按 bdm/<宽>_<高>_<画质> 出图，同一张图可以任意挑档（实测到 2560 都有，超过原图大小不会放大） */
function buildVariants(raw: string): WallpaperVariant[] {
  const file = raw.split("/").pop() ?? "";
  const host = toHttps(raw).replace(/\/(?:bdr|bdm)\/[^/]+\/[^/]+$/, "");
  if (!file || file === raw || !/^https:\/\/p\d+\.qhimg\.com$/.test(host)) return [];
  const at = (w: number, h: number) => `${host}/bdm/${w}_${h}_85/${file}`;
  return [
    { px: 1024, url: at(1024, 768) },
    { px: 1366, url: at(1366, 768) },
    { px: 1600, url: at(1600, 900) },
    { px: 1920, url: at(1920, 1080) },
    { px: 2560, url: at(2560, 1440) },
    { px: 1280, url: at(1280, 1024), portrait: true },
  ];
}

/**
 * 壁纸标题：接口把分类名塞在 tag 里，形如
 * `_全部_ _category_海洋天堂_ _category_风景大片_`，最后一个是这张图所属的分类。
 */
function titleOf(item: any): string {
  const cats = [...String(item?.tag ?? "").matchAll(/_category_([^_]+)_/g)].map((m) => m[1]);
  const category = cats[cats.length - 1] ?? "";
  const keywords = String(item?.utag ?? "").trim();
  if (!category && !keywords) return "小鸟壁纸";
  return [category || "小鸟壁纸", keywords].filter(Boolean).join(" · ");
}

function toHttps(v: string): string {
  return v.replace(/^http:/i, "https:");
}

/** 带超时的 JSON 请求 */
async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      accept: "application/json,text/plain,*/*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * 前台一次性拿到壁纸与遮罩强度。
 * 壁纸解析失败时只影响背景图，页面照常渲染。
 */
export async function getWallpaperView(): Promise<{
  wallpaper: Wallpaper | null;
  mask: WallpaperMask;
}> {
  const cfg = await getWallpaperSettings().catch(() => DEFAULT_SETTINGS);
  const wallpaper = await getWallpaper(cfg);
  return { wallpaper, mask: cfg.mask };
}
