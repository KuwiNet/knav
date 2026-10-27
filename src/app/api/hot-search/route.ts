import { NextResponse } from "next/server";
import { getContentItems } from "@/lib/content";

export const dynamic = "force-dynamic";

/**
 * 首页「热门搜索」数据源。
 *
 * 百度实时热榜没有面向个人的公开接口，页面结构也常改，
 * 所以服务端代理一次（带 UA/Referer），并做进程内缓存；
 * 一旦取不到就退回站内浏览量最高的内容，首页不能出现空榜。
 */

interface HotItem {
  title: string;
  url: string;
}

interface HotPayload {
  source: "baidu" | "site";
  items: HotItem[];
  /** 取到的时间戳，前端显示「更新于」 */
  at: number;
}

const BAIDU_URL = "https://top.baidu.com/api/board?platform=wise&tab=realtime";
/** 热榜没必要每分钟打一次百度 */
const BAIDU_TTL = 10 * 60 * 1000;
/** 兜底数据只缓存 1 分钟，方便百度恢复后马上切回去 */
const SITE_TTL = 60 * 1000;

let cache: HotPayload | null = null;

/**
 * 从百度返回的任意层级 JSON 里捞出带 word/url 的条目。
 * 按字段形状找，比按 data.cards[0].content[0].content 这种路径找抗改。
 */
function collectWords(node: unknown, out: HotItem[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectWords(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const title = typeof obj.word === "string" ? obj.word.trim() : "";
  if (title) {
    const rawUrl = typeof obj.url === "string" ? obj.url : "";
    let url = "";
    try {
      const u = new URL(rawUrl);
      if (u.protocol === "https:" || u.protocol === "http:") url = u.toString();
    } catch {
      /* 非 http(s) 的地址直接当无链接处理 */
    }
    out.push({ title: title.slice(0, 60), url });
    return;
  }
  for (const v of Object.values(obj)) collectWords(v, out);
}

async function fetchBaidu(): Promise<HotItem[]> {
  const res = await fetch(BAIDU_URL, {
    signal: AbortSignal.timeout(6000),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Referer: "https://top.baidu.com/board?tab=realtime",
      Accept: "application/json,text/plain,*/*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json: unknown = await res.json();
  const out: HotItem[] = [];
  collectWords(json, out);
  // 同一词条可能出现多次（置顶 + 列表），只留第一次
  const seen = new Set<string>();
  return out.filter((i) => (seen.has(i.title) ? false : (seen.add(i.title), true))).slice(0, 12);
}

/** 站内兜底：浏览量最高的内容 */
async function siteHot(): Promise<HotItem[]> {
  const items = await getContentItems({ orderBy: "views", limit: 12 });
  return items.map((i) => ({ title: i.title, url: i.path }));
}

function ttlOf(payload: HotPayload): number {
  return payload.source === "baidu" ? BAIDU_TTL : SITE_TTL;
}

export async function GET() {
  if (cache && Date.now() - cache.at < ttlOf(cache)) {
    return NextResponse.json(cache);
  }

  try {
    const items = await fetchBaidu();
    if (items.length > 0) {
      cache = { source: "baidu", items, at: Date.now() };
      return NextResponse.json(cache);
    }
    throw new Error("热榜为空");
  } catch {
    const fallback = cache?.source === "site" ? cache : null;
    if (fallback && Date.now() - fallback.at < SITE_TTL) {
      return NextResponse.json(fallback);
    }
    const next: HotPayload = { source: "site", items: await siteHot(), at: Date.now() };
    cache = next;
    return NextResponse.json(next);
  }
}
