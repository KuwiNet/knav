"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * 右下角悬浮按钮组。
 *
 * 导航站常见的几个：返回顶部、站内搜索、主题切换、回首页。
 * 返回顶部的按钮要等页面滚下去一段才出现，不然一进站就杵在右下角挡内容。
 */

const THEME_KEY = "knav-theme";

type Theme = "light" | "dark";

function Icon({ name }: { name: "up" | "search" | "sun" | "moon" | "home" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "up")
    return (
      <svg {...common}>
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    );
  if (name === "search")
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.2-3.2" />
      </svg>
    );
  if (name === "sun")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (name === "moon")
    return (
      <svg {...common}>
        <path d="M21 13.2A9 9 0 1 1 10.8 3a7 7 0 0 0 10.2 10.2z" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </svg>
  );
}

export default function FloatingActions() {
  const [showTop, setShowTop] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const update = () => setShowTop(window.scrollY > 320);
    update();
    window.addEventListener("scroll", update, { passive: true });
    // 部分内嵌浏览器不派发 scroll 事件，补一个低频轮询兜底
    const timer = setInterval(update, 250);
    return () => {
      window.removeEventListener("scroll", update);
      clearInterval(timer);
    };
  }, []);

  // 初始主题由 <head> 里的内联脚本定好，这里只是把状态同步到按钮图标上
  useEffect(() => {
    const cur = document.documentElement.dataset.theme;
    if (cur === "dark" || cur === "light") setTheme(cur);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // 隐私模式下写不了，忽略即可
    }
  };

  return (
    <div className="float-actions" role="complementary" aria-label="快捷操作">
      <Link
        href="/search"
        className="float-btn"
        title="站内搜索"
        aria-label="站内搜索"
      >
        <Icon name="search" />
      </Link>

      <button
        type="button"
        className="float-btn"
        onClick={toggleTheme}
        title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
        aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} />
      </button>

      <Link href="/" className="float-btn" title="回首页" aria-label="回首页">
        <Icon name="home" />
      </Link>

      {showTop ? (
        <button
          type="button"
          className="float-btn float-btn-top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          title="返回顶部"
          aria-label="返回顶部"
        >
          <Icon name="up" />
        </button>
      ) : null}
    </div>
  );
}
