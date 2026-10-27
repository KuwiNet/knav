"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { renderMarkdownSync } from "@/lib/markdown";
import { searchMediaAction } from "@/lib/actions/media-actions";

/**
 * Markdown 文章编辑器。
 *
 * 目标：像常见 CMS 那样，有完整工具栏、快捷键、实时预览、图片插入，
 *      后台写文章不用去外部编辑器来回粘贴。
 */

interface ToolItem {
  key: string;
  label: string;
  title: string;
  action: Action;
  /** 分组分隔 */
  sep?: boolean;
}

type Action =
  | { kind: "wrap"; before: string; after: string; placeholder: string }
  | { kind: "line"; prefix: string; placeholder: string }
  | { kind: "block"; before: string; after: string; placeholder: string }
  | { kind: "raw"; text: string };

const TOOLS: ToolItem[] = [
  { key: "h2", label: "H2", title: "二级标题（Ctrl+2）", action: { kind: "line", prefix: "## ", placeholder: "标题" } },
  { key: "h3", label: "H3", title: "三级标题（Ctrl+3）", action: { kind: "line", prefix: "### ", placeholder: "标题" } },
  { key: "bold", label: "B", title: "加粗（Ctrl+B）", action: { kind: "wrap", before: "**", after: "**", placeholder: "加粗" } },
  { key: "italic", label: "I", title: "斜体（Ctrl+I）", action: { kind: "wrap", before: "*", after: "*", placeholder: "斜体" } },
  { key: "strike", label: "S", title: "删除线（Ctrl+Shift+X）", action: { kind: "wrap", before: "~~", after: "~~", placeholder: "删除线" } },
  { key: "sep1", label: "", title: "", action: { kind: "raw", text: "" }, sep: true },
  { key: "quote", label: "❝", title: "引用", action: { kind: "line", prefix: "> ", placeholder: "引用内容" } },
  { key: "ul", label: "• 列表", title: "无序列表", action: { kind: "line", prefix: "- ", placeholder: "列表项" } },
  { key: "ol", label: "1. 列表", title: "有序列表", action: { kind: "line", prefix: "1. ", placeholder: "列表项" } },
  { key: "task", label: "☑ 任务", title: "任务列表", action: { kind: "line", prefix: "- [ ] ", placeholder: "任务" } },
  { key: "sep2", label: "", title: "", action: { kind: "raw", text: "" }, sep: true },
  { key: "code", label: "代码块", title: "代码块（Ctrl+Shift+C）", action: { kind: "block", before: "```js\n", after: "\n```", placeholder: "code" } },
  { key: "inline", label: "`code`", title: "行内代码", action: { kind: "wrap", before: "`", after: "`", placeholder: "code" } },
  { key: "link", label: "🔗 链接", title: "插入链接（Ctrl+K）", action: { kind: "wrap", before: "[", after: "](https://)", placeholder: "链接文字" } },
  { key: "image", label: "🖼 图片", title: "插入图片（Ctrl+Shift+I）", action: { kind: "wrap", before: "![", after: "](https://)", placeholder: "图片说明" } },
  { key: "media", label: "📁 素材库", title: "从素材库插入图片", action: { kind: "raw", text: "" } },
  { key: "sep3", label: "", title: "", action: { kind: "raw", text: "" }, sep: true },
  { key: "table", label: "表格", title: "插入表格", action: { kind: "block", before: "| 列1 | 列2 |\n| --- | --- |\n| 内容 | 内容 |\n", after: "", placeholder: "" } },
  { key: "hr", label: "—", title: "分割线", action: { kind: "raw", text: "\n\n---\n\n" } },
  { key: "color", label: "🎨 颜色", title: "文字颜色", action: { kind: "block", before: '<span style="color:', after: '">文字</span>', placeholder: "#ff5722" } },
  { key: "size", label: "🔠 字号", title: "字号", action: { kind: "block", before: '<span style="font-size:', after: 'px">文字</span>', placeholder: "20" } },
  { key: "center", label: "⛶ 居中", title: "居中", action: { kind: "block", before: '<div style="text-align:center">', after: "</div>", placeholder: "居中内容" } },
];

export default function MarkdownEditor({
  name,
  value,
  placeholder = "在这里写正文，支持 Markdown…",
  minHeight = 420,
  required = false,
  mediaPicker = true,
}: {
  name: string;
  value?: string;
  placeholder?: string;
  minHeight?: number;
  required?: boolean;
  /** 素材库按钮依赖后台的 searchMediaAction（仅管理员可用），投稿页要关掉 */
  mediaPicker?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(value ?? "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mediaList, setMediaList] = useState<
    { id: number; url: string; filename: string }[]
  >([]);
  const [, startTransition] = useTransition();

  // 表单外部重置时同步（例如切换编辑对象）
  useEffect(() => {
    setText(value ?? "");
  }, [value]);

  const replace = useCallback((next: string, selStart: number, selEnd: number) => {
    setText(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }, []);

  const apply = useCallback(
    (action: Action) => {
      const el = ref.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const sel = text.slice(start, end);

      if (action.kind === "wrap") {
        const body = sel || action.placeholder;
        const next =
          text.slice(0, start) + action.before + body + action.after + text.slice(end);
        replace(next, start + action.before.length, start + action.before.length + body.length);
        return;
      }

      if (action.kind === "line") {
        const lineStart = text.lastIndexOf("\n", start - 1) + 1;
        const lineEnd = text.indexOf("\n", end) === -1 ? text.length : text.indexOf("\n", end);
        const block = text.slice(lineStart, lineEnd);
        const lines = block.split("\n").map((l, i) => {
          const stripped = l.replace(/^(\s*)(#{1,6}\s|>\s|[-*]\s|\d+\.\s|- \[[ x]\]\s)/, "$1");
          return `${i === 0 ? action.prefix : action.prefix}${stripped}`;
        });
        const body = lines.join("\n");
        const next = text.slice(0, lineStart) + body + text.slice(lineEnd);
        replace(next, lineStart, lineStart + body.length);
        return;
      }

      if (action.kind === "block") {
        const body = sel || action.placeholder;
        const block = (action.before + body + action.after).trimEnd();
        // 围栏代码、表格这类块级语法必须自己占一段：紧贴上一行会渲染成纯文本
        const head = text.slice(0, start);
        const tail = text.slice(end);
        const lead = head && !/\n\n$/.test(head) ? (/\n$/.test(head) ? "\n" : "\n\n") : "";
        const trail = tail && !/^\n\n/.test(tail) ? (tail.startsWith("\n") ? "\n" : "\n\n") : "";
        const next = head + lead + block + trail + tail;
        const selStart = start + lead.length + action.before.length;
        replace(next, selStart, selStart + body.length);
        return;
      }

      // raw
      if (!action.text) return;
      const next = text.slice(0, start) + action.text + text.slice(end);
      replace(next, start + action.text.length, start + action.text.length);
    },
    [text, replace]
  );

  // 素材库
  const openPicker = useCallback(() => {
    setPickerOpen(true);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("keyword", "");
      const r = await searchMediaAction(fd);
      if (r.ok) setMediaList(r.items);
    });
  }, []);

  const insertText = useCallback(
    (snippet: string) => {
      const el = ref.current;
      const start = el?.selectionStart ?? text.length;
      const end = el?.selectionEnd ?? text.length;
      const next = text.slice(0, start) + snippet + text.slice(end);
      replace(next, start + snippet.length, start + snippet.length);
    },
    [text, replace]
  );

  // 快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (!el || document.activeElement !== el) return;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        apply({ kind: "wrap", before: "**", after: "**", placeholder: "加粗" });
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        apply({ kind: "wrap", before: "*", after: "*", placeholder: "斜体" });
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "x") {
        e.preventDefault();
        apply({ kind: "wrap", before: "~~", after: "~~", placeholder: "删除线" });
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        apply({ kind: "block", before: "```\n", after: "\n```", placeholder: "code" });
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        apply({ kind: "wrap", before: "![", after: "](https://)", placeholder: "图片说明" });
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        apply({ kind: "wrap", before: "[", after: "](https://)", placeholder: "链接文字" });
      } else if (mod && e.key === "2") {
        e.preventDefault();
        apply({ kind: "line", prefix: "## ", placeholder: "标题" });
      } else if (mod && e.key === "3") {
        e.preventDefault();
        apply({ kind: "line", prefix: "### ", placeholder: "标题" });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [apply]);

  const html = mode === "preview" ? renderMarkdownSync(text) : "";
  const words = text.replace(/\s/g, "").length;

  return (
    <div className="md-editor">
      <div className="md-toolbar">
        {TOOLS.map((t) => {
          if (t.sep) return <span key={t.key} className="md-sep" />;
          if (t.key === "media") {
            if (!mediaPicker) return null;
            return (
              <button
                key={t.key}
                type="button"
                className="md-btn"
                title={t.title}
                onClick={openPicker}
              >
                {t.label}
              </button>
            );
          }
          return (
            <button
              key={t.key}
              type="button"
              className="md-btn"
              title={t.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply(t.action)}
            >
              {t.label}
            </button>
          );
        })}
        <span className="spacer" />
        <button
          type="button"
          className={`md-btn${mode === "edit" ? " active" : ""}`}
          onClick={() => setMode("edit")}
          title="编辑模式"
        >
          编辑
        </button>
        <button
          type="button"
          className={`md-btn${mode === "preview" ? " active" : ""}`}
          onClick={() => setMode("preview")}
          title="预览模式"
        >
          预览
        </button>
      </div>

      {mode === "edit" ? (
        <>
          <textarea
            ref={ref}
            name={name}
            className="textarea md-input"
            style={{ minHeight }}
            value={text}
            placeholder={placeholder}
            required={required}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="md-status">
            <span>字数 {words}</span>
            <span className="text-muted">
              快捷键：Ctrl+B 加粗 · Ctrl+I 斜体 · Ctrl+K 链接 · Ctrl+Shift+C 代码块 ·
              Ctrl+Shift+I 图片
            </span>
          </div>
        </>
      ) : (
        <>
          <div
            className="article-body md-preview"
            style={{ minHeight }}
            dangerouslySetInnerHTML={{ __html: html || "<p class='text-muted'>暂无内容</p>" }}
          />
          <input type="hidden" name={name} value={text} />
        </>
      )}

      {pickerOpen ? (
        <div className="md-picker">
          <div className="row" style={{ marginBottom: 10 }}>
            <strong>素材库</strong>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setPickerOpen(false)}
            >
              关闭
            </button>
          </div>
          {mediaList.length === 0 ? (
            <div className="text-muted text-sm">素材库还是空的，先去「素材库」上传图片。</div>
          ) : (
            <div className="md-picker-grid">
              {mediaList.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="md-picker-item"
                  title={m.filename}
                  onClick={() => {
                    insertText(`![${m.filename}](${m.url})`);
                    setPickerOpen(false);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.filename} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
