"use client";

import { useEffect } from "react";

/**
 * 代码块复制按钮。
 *
 * 代码块是服务端渲染好的 HTML（带 .code-block / .code-copy 结构），
 * 这里只在浏览器端接管点击行为，不改动页面结构。
 */
export default function CodeCopy() {
  useEffect(() => {
    const onClick = async (event: Event) => {
      const target = event.target as HTMLElement | null;
      const btn = target?.closest?.(".code-copy") as HTMLButtonElement | null;
      if (!btn) return;

      const block = btn.closest(".code-block");
      const code = block?.querySelector("pre code")?.textContent ?? "";
      const label = btn.textContent || "复制";

      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = "已复制";
      } catch {
        // 剪贴板不可用时退回旧方案
        try {
          const ta = document.createElement("textarea");
          ta.value = code;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          btn.textContent = "已复制";
        } catch {
          btn.textContent = "复制失败";
        }
      }

      window.setTimeout(() => {
        btn.textContent = label;
      }, 1600);
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
