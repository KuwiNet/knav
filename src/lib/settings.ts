// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  require("server-only");
}
import { query, execute } from "./db";
import {
  SETTINGS_FIELDS,
  SETTING_MAP,
  SETTING_DEFAULTS,
  type SettingField,
} from "./settings-config";

/**
 * 站点设置中心的读写层。
 *
 * 所有可配置项的定义在 ./settings-config（纯数据，客户端也能用），
 * 这里负责：默认值回退、短缓存、批量写入。
 * 避免"表单里有、保存不进去"或"前台读的还是旧值"这类问题。
 *
 * 存储位置：knav_settings（name / value）。
 */

export {
  SETTING_GROUPS,
  SETTINGS_FIELDS,
  SETTING_MAP,
  SETTING_KEYS,
  SETTING_DEFAULTS,
  CARD_STYLES,
  CODE_THEMES,
  type SettingType,
  type SettingGroupDef,
  type SettingField,
} from "./settings-config";

/* ---------------------------------------------------------------- 读写 */

let cache: { map: Record<string, string>; at: number } | null = null;
const CACHE_TTL = 10 * 1000;

/** 读取全部设置（带默认值回退与短缓存） */
export async function getSettingMap(
  opts: { fresh?: boolean } = {}
): Promise<Record<string, string>> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_TTL) {
    return cache.map;
  }
  const rows = await query<{ name: string; value: string }>(
    "SELECT name, value FROM knav_settings"
  );
  const map: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows) {
    if (r.name in SETTING_MAP) map[r.name] = r.value ?? "";
  }
  cache = { map, at: Date.now() };
  return map;
}

/** 读取单个设置（带默认值） */
export async function getSetting(key: string): Promise<string> {
  const map = await getSettingMap();
  return map[key] ?? SETTING_DEFAULTS[key] ?? "";
}

/** 读取布尔型设置 */
export async function getSwitch(key: string): Promise<boolean> {
  const v = await getSetting(key);
  return v === "1" || v.toLowerCase() === "true";
}

/** 读取数字型设置 */
export async function getNumber(key: string, fallback = 0): Promise<number> {
  const v = Number(await getSetting(key));
  return Number.isFinite(v) ? v : fallback;
}

/** 保存一批设置（只接受注册表里声明过的键） */
export async function saveSettingValues(
  values: Record<string, string | undefined>
): Promise<{ ok: boolean; saved: string[]; error?: string }> {
  const entries = Object.entries(values).filter(
    ([k, v]) => v !== undefined && k in SETTING_MAP
  );
  if (entries.length === 0) return { ok: true, saved: [] };

  for (const [name, value] of entries) {
    await execute(
      `INSERT INTO knav_settings (name, value) VALUES (?,?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP`,
      [name, String(value)]
    );
  }
  cache = null;
  return { ok: true, saved: entries.map(([k]) => k) };
}

/** 清空缓存（保存后调用） */
export function resetSettingsCache(): void {
  cache = null;
}

/** 取某个分组的字段定义 */
export function fieldsOfGroup(group: string): SettingField[] {
  return SETTINGS_FIELDS.filter((f) => f.group === group);
}

/* ---------------------------------------------------------------- 前台配置 */

/** 卡片外观配置（后台「外观与卡片」里配置） */
export interface CardConfig {
  style: "shadow" | "border" | "plain";
  radius: number;
  columns: "auto" | "3" | "4" | "5" | "6";
  density: "compact" | "normal" | "loose";
  fixedHeight: boolean;
  titleLines: 1 | 2;
  showCategory: boolean;
  showType: boolean;
  showViews: boolean;
  showTags: boolean;
  iconMode: "auto" | "letter";
}

export async function getCardConfig(): Promise<CardConfig> {
  const map = await getSettingMap();
  const num = (k: string, d: number) => {
    const n = Number(map[k]);
    return Number.isFinite(n) ? n : d;
  };
  const columns = map.card_columns ?? "auto";
  const density = map.card_density ?? "normal";
  const style = map.card_style ?? "shadow";
  const iconMode = map.card_icon_mode ?? "auto";
  const lines = num("card_title_lines", 1);

  return {
    style: (["shadow", "border", "plain"].includes(style)
      ? style
      : "shadow") as CardConfig["style"],
    radius: num("card_radius", 12),
    columns: (["auto", "3", "4", "5", "6"].includes(columns)
      ? columns
      : "auto") as CardConfig["columns"],
    density: (["compact", "normal", "loose"].includes(density)
      ? density
      : "normal") as CardConfig["density"],
    fixedHeight: map.card_fixed_height !== "0",
    titleLines: lines >= 2 ? 2 : 1,
    showCategory: map.card_show_category !== "0",
    showType: map.card_show_type !== "0",
    showViews: map.card_show_views !== "0",
    showTags: map.card_show_tags === "1",
    iconMode: iconMode === "letter" ? "letter" : "auto",
  };
}

/** 代码块配置 */
export interface CodeConfig {
  theme: string;
  showCopy: boolean;
  showLang: boolean;
  inlineStyle: "soft" | "badge" | "underline";
}

export async function getCodeConfig(): Promise<CodeConfig> {
  const map = await getSettingMap();
  const inline = map.code_inline_style ?? "soft";
  return {
    theme: map.code_theme ?? "github",
    showCopy: map.code_show_copy !== "0",
    showLang: map.code_show_lang !== "0",
    inlineStyle: (["soft", "badge", "underline"].includes(inline)
      ? inline
      : "soft") as CodeConfig["inlineStyle"],
  };
}
