"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  DEFAULT_ENGINE_KEY,
  OPEN_SEARCH_EVENT,
  SEARCH_ENGINES,
  SEARCH_HISTORY_KEY,
  SEARCH_HISTORY_MAX,
  getEngine,
} from "@/lib/search-engines";

interface HotItem {
  title: string;
  url: string;
}
interface HotPayload {
  source: "baidu" | "site";
  items: HotItem[];
}
interface HistoryItem {
  q: string;
  engine: string;
}

/** 搜索历史只存在浏览器里，不建表也不上报 */
function readHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (i): i is HistoryItem =>
          !!i && typeof (i as HistoryItem).q === "string" && !!(i as HistoryItem).q.trim()
      )
      .slice(0, SEARCH_HISTORY_MAX);
  } catch {
    return [];
  }
}

function writeHistory(items: HistoryItem[]): void {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items));
  } catch {
    // 隐私模式或配额满了，不该因此挡住搜索
  }
}

/** 顶栏搜索按钮 + 页头下方的全局面板，全站布局共用一份 */
export default function GlobalSearch() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  // 面板贴在页头下沿；手机端页头会折成两行，所以运行时量高度
  const [top, setTop] = useState(0);
  const [engine, setEngine] = useState(DEFAULT_ENGINE_KEY);
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [hot, setHot] = useState<HotPayload | null>(null);
  const [hotFailed, setHotFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    setHistory(readHistory());
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 右下角悬浮按钮发事件打开同一面板，避免跳到单独的搜索页
  useEffect(() => {
    const openPanel = () => {
      const header = document.querySelector<HTMLElement>(".site-header");
      setTop(header?.getBoundingClientRect().bottom ?? 0);
      setOpen(true);
    };
    window.addEventListener(OPEN_SEARCH_EVENT, openPanel);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, openPanel);
  }, []);

  useEffect(() => {
    if (!open) return;
    const header = document.querySelector<HTMLElement>(".site-header");
    const update = () => setTop(header?.getBoundingClientRect().bottom ?? 0);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // 展开后才请求热榜，避免每次渲染都去打百度
  useEffect(() => {
    if (!open || hot || hotFailed) return;
    let alive = true;
    fetch("/api/hot-search")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: HotPayload) => {
        if (!alive) return;
        if (Array.isArray(d?.items) && d.items.length > 0) setHot(d);
        else setHotFailed(true);
      })
      .catch(() => {
        if (alive) setHotFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [open, hot, hotFailed]);

  const eng = getEngine(engine);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const header = document.querySelector<HTMLElement>(".site-header");
    setTop(header?.getBoundingClientRect().bottom ?? 0);
    setOpen(true);
  };

  const submitGuard = (e: FormEvent<HTMLFormElement>) => {
    const term = query.trim();
    if (!term) {
      e.preventDefault();
      return;
    }
    const next: HistoryItem[] = [
      { q: term, engine },
      ...history.filter((h) => !(h.q === term && h.engine === engine)),
    ].slice(0, SEARCH_HISTORY_MAX);
    setHistory(next);
    writeHistory(next);
    // 站内搜索等路由变化后由 pathname 副作用收起；
    // 外部引擎必须在这里同步打开新标签再收面板：
    // 先 setOpen(false) 会把表单从 DOM 里卸载，原生 target=_blank 的提交随之被取消。
    if (eng.external) {
      e.preventDefault();
      const url = new URL(eng.action);
      url.searchParams.set(eng.param, term);
      window.open(url.toString(), "_blank", "noopener,noreferrer");
      setOpen(false);
    }
  };

  const useTerm = (term: string, engineKey?: string) => {
    setQuery(term);
    if (engineKey) setEngine(engineKey);
    inputRef.current?.focus();
  };

  const panel = (
    <div
      className="search-layer"
      id="global-search-panel"
      role="dialog"
      aria-modal="true"
      aria-label="搜索"
      style={{ top }}
    >
      <div className="container search-layer-inner">
        <div className="search-panel-head">
          <div className="search-panel-title">
            <span className="search-icon" aria-hidden />
            <span>搜索</span>
            <span className="text-muted text-sm" style={{ fontWeight: 400 }}>
              网址 · 文章 · 下载 · 标签
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setOpen(false)}
            aria-label="关闭搜索"
          >
            关闭
          </button>
        </div>

        <div className="search-panel-grid">
          <div>
            <div className="engine-chips" role="radiogroup" aria-label="搜索引擎">
              {SEARCH_ENGINES.map((e) => (
                <button
                  key={e.key}
                  type="button"
                  role="radio"
                  aria-checked={engine === e.key}
                  className={`engine-chip${engine === e.key ? " is-active" : ""}`}
                  onClick={() => setEngine(e.key)}
                >
                  {e.label}
                </button>
              ))}
            </div>

            <form
              action={eng.action}
              method="get"
              onSubmit={submitGuard}
              className="search-form"
              target={eng.external ? "_blank" : undefined}
              rel={eng.external ? "noreferrer" : undefined}
            >
              <input
                ref={inputRef}
                type="search"
                name={eng.param}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="input"
                placeholder={`在${eng.label}搜索…`}
                aria-label="搜索关键词"
              />
              <button type="submit" className="btn btn-lg">
                {eng.external ? "新窗口搜索" : "搜索"}
              </button>
            </form>

            <div className="hint">
              默认站内搜索；选外部引擎会在新标签页打开结果，按 Esc 可收起面板。
            </div>
          </div>

          <div className="search-panel-side">
            <div className="search-side-block">
              <div className="search-side-head">
                <strong>热门搜索</strong>
                {hot ? (
                  <span className="text-muted text-sm">
                    {hot.source === "baidu" ? "百度实时热榜" : "站内热门"}
                  </span>
                ) : null}
              </div>
              {hot ? (
                <ol className="hot-list">
                  {hot.items.map((item, i) =>
                    item.url ? (
                      <li key={item.title}>
                        <span className="hot-rank">{i + 1}</span>
                        <a
                          href={item.url}
                          target={/^https?:/i.test(item.url) ? "_blank" : undefined}
                          rel={/^https?:/i.test(item.url) ? "noreferrer" : undefined}
                          title={item.title}
                          onClick={() => setOpen(false)}
                        >
                          {item.title}
                        </a>
                      </li>
                    ) : (
                      <li key={item.title}>
                        <span className="hot-rank">{i + 1}</span>
                        <button type="button" onClick={() => useTerm(item.title)}>
                          {item.title}
                        </button>
                      </li>
                    )
                  )}
                </ol>
              ) : (
                <div className="text-sm text-muted">
                  {hotFailed ? "暂时取不到热榜，直接用关键词搜索。" : "正在加载热门搜索…"}
                </div>
              )}
            </div>

            <div className="search-side-block">
              <div className="search-side-head">
                <strong>搜索历史</strong>
                {history.length > 0 ? (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      setHistory([]);
                      writeHistory([]);
                    }}
                  >
                    清空
                  </button>
                ) : null}
              </div>
              {history.length > 0 ? (
                <div className="history-chips">
                  {history.map((h) => (
                    <button
                      key={`${h.engine}-${h.q}`}
                      type="button"
                      className="tag-chip"
                      onClick={() => useTerm(h.q, h.engine)}
                      title={`用${getEngine(h.engine).label}搜索「${h.q}」`}
                    >
                      {h.q}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted">还没有搜索记录，只保存在这台设备上。</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className={`btn btn-sm${open ? "" : " btn-ghost"}`}
        title="搜索"
        aria-expanded={open}
        aria-controls="global-search-panel"
        aria-haspopup="dialog"
        onClick={toggle}
      >
        搜索
      </button>
      {mounted && open
        ? createPortal(
            <>
              <div
                className="search-scrim"
                style={{ top }}
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />
              {panel}
            </>,
            document.body
          )
        : null}
    </>
  );
}
