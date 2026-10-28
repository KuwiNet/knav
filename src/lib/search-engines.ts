/**
 * 搜索引擎清单（客户端可共享的纯数据，不放服务端模块）。
 *
 * 站内是默认引擎；其余引擎用原生 GET 表单直连，
 * param 必须与各站点实际的查询参数名一致，否则跳过去是空结果页。
 */
export interface SearchEngine {
  key: string;
  label: string;
  /** 提交地址；站内是相对路径 */
  action: string;
  /** 查询词用的表单字段名 */
  param: string;
  /** 外部引擎在新标签页打开 */
  external: boolean;
}

export const SEARCH_ENGINES: SearchEngine[] = [
  { key: "site", label: "站内搜索", action: "/search", param: "q", external: false },
  { key: "bing", label: "Bing", action: "https://www.bing.com/search", param: "q", external: true },
  { key: "baidu", label: "百度", action: "https://www.baidu.com/s", param: "wd", external: true },
  { key: "google", label: "Google", action: "https://www.google.com/search", param: "q", external: true },
  { key: "so", label: "360", action: "https://www.so.com/s", param: "q", external: true },
  { key: "sogou", label: "搜狗", action: "https://www.sogou.com/web", param: "query", external: true },
];

export const DEFAULT_ENGINE_KEY = "site";

export function getEngine(key: string): SearchEngine {
  return SEARCH_ENGINES.find((e) => e.key === key) ?? SEARCH_ENGINES[0];
}

/** 搜索历史存 localStorage 的键与条数上限 */
export const SEARCH_HISTORY_KEY = "knav_search_history";
export const SEARCH_HISTORY_MAX = 10;
