"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { renderMarkdownSync } from "@/lib/markdown";
import { formatSize, isImageMedia } from "@/lib/media-config";
import { blockPad, spliceBlock, spliceInline } from "@/lib/md-insert";
import {
  searchMediaAction,
  uploadContentAssetAction,
  uploadContentFileAction,
} from "@/lib/actions/media-actions";

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
  { key: "file", label: "📎 文件", title: "上传附件并插入下载链接", action: { kind: "raw", text: "" } },
  { key: "media", label: "📁 素材库", title: "从素材库插入图片", action: { kind: "raw", text: "" } },
  { key: "sep3", label: "", title: "", action: { kind: "raw", text: "" }, sep: true },
  { key: "table", label: "表格", title: "插入表格", action: { kind: "block", before: "| 列1 | 列2 |\n| --- | --- |\n| 内容 | 内容 |\n", after: "", placeholder: "" } },
  { key: "hr", label: "—", title: "分割线", action: { kind: "raw", text: "\n\n---\n\n" } },
  { key: "color", label: "🎨 颜色", title: "文字颜色", action: { kind: "block", before: '<span style="color:', after: '">文字</span>', placeholder: "#ff5722" } },
  { key: "size", label: "🔠 字号", title: "字号", action: { kind: "block", before: '<span style="font-size:', after: 'px">文字</span>', placeholder: "20" } },
  { key: "center", label: "⛶ 居中", title: "居中", action: { kind: "block", before: '<div style="text-align:center">', after: "</div>", placeholder: "居中内容" } },
];

/** 代码块语言候选；值直接写进围栏信息串，渲染端（markdown.ts）再做别名归一 */
const CODE_LANGS: { value: string; label: string }[] = [
  { value: "text", label: "纯文本" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX / React" },
  { value: "tsx", label: "TSX" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "toml", label: "TOML" },
  { value: "ini", label: "INI / 配置" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "bash", label: "Shell / Bash" },
  { value: "powershell", label: "PowerShell" },
  { value: "dockerfile", label: "Dockerfile" },
  { value: "makefile", label: "Makefile" },
  { value: "python", label: "Python" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
  { value: "kotlin", label: "Kotlin" },
  { value: "swift", label: "Swift" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "sql", label: "SQL" },
  { value: "markdown", label: "Markdown" },
  { value: "diff", label: "Diff" },
];

/** 附件弹窗放行的类型，与服务端 fileKindFromBytes 的判定保持一致 */
const FILE_ACCEPT =
  ".pdf,.docx,.xlsx,.pptx,.zip,.rar,.7z,.gz,.mp3,.mp4,.txt,.md," +
  ".png,.jpg,.jpeg,.gif,.webp,.avif,.bmp,.ico";

type DialogKind = "image" | "file" | "code";
type Notice = { kind: "ok" | "error"; text: string };

/** 弹窗底部：提示 + 取消 / 插入 */
function DialogFoot({
  notice,
  okDisabled,
  onCancel,
  onOk,
}: {
  notice: Notice | null;
  okDisabled?: boolean;
  onCancel: () => void;
  onOk: () => void;
}) {
  return (
    <>
      {notice ? (
        <div
          className="hint"
          style={{
            marginTop: 8,
            color: notice.kind === "error" ? "var(--red)" : "var(--green)",
          }}
        >
          {notice.text}
        </div>
      ) : null}
      <div className="md-modal-foot">
        <button type="button" className="btn btn-sm btn-outline" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="btn btn-sm" onClick={onOk} disabled={okDisabled}>
          插入
        </button>
      </div>
    </>
  );
}

/** 上传相关的入口只在后台编辑器出现，投稿页保持纯语法 */
const ADMIN_ONLY: Record<string, boolean> = { file: true, media: true };

function EditorModal({
  title,
  hint,
  onClose,
  children,
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="md-modal-mask"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="md-modal">
        <div className="md-modal-head">
          <div>
            <strong>{title}</strong>
            {hint ? (
              <div className="hint" style={{ marginTop: 2 }}>
                {hint}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        <div className="md-modal-body">{children}</div>
      </div>
    </div>
  );
}

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
  /** 弹窗会抢走焦点，插入位置必须打开弹窗时就记下来 */
  const selRef = useRef<{ start: number; end: number } | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value ?? "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [uploaded, setUploaded] = useState<{
    url: string;
    name: string;
    mime: string;
    size: number;
  } | null>(null);
  const [linkText, setLinkText] = useState("");
  const [lang, setLang] = useState("javascript");
  const [code, setCode] = useState("");
  const [mediaList, setMediaList] = useState<
    { id: number; url: string; filename: string; mime: string }[]
  >([]);
  const [pending, startTransition] = useTransition();

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
        const { lead, trail } = blockPad(text.slice(0, start), text.slice(end));
        const next = text.slice(0, start) + lead + block + trail + text.slice(end);
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

  /** 打开弹窗前先把光标位置存下来：弹窗一旦拿到焦点，textarea 的选区就不再可靠 */
  const rememberSel = useCallback(() => {
    const el = ref.current;
    const sel = el
      ? { start: el.selectionStart, end: el.selectionEnd }
      : { start: text.length, end: text.length };
    selRef.current = sel;
    return sel;
  }, [text.length]);

  /** 弹窗确认后的统一写入口：block 为真时按块级语法补空行，caretIn 把光标停在片段内 */
  const insert = useCallback(
    (snippet: string, block = false, caretIn?: number) => {
      const sel = selRef.current ?? { start: text.length, end: text.length };
      selRef.current = null;
      const r = block
        ? spliceBlock(text, sel, snippet, caretIn)
        : spliceInline(text, sel, snippet, caretIn);
      replace(r.text, r.start, r.end);
    },
    [text, replace]
  );

  // 素材库
  const openPicker = useCallback(() => {
    rememberSel();
    setPickerOpen(true);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("keyword", "");
      const r = await searchMediaAction(fd);
      if (r.ok) setMediaList(r.items);
    });
  }, [rememberSel]);

  const closeDialog = useCallback(() => {
    setDialog(null);
    setNotice(null);
    selRef.current = null;
  }, []);

  const openDialog = useCallback(
    (kind: DialogKind) => {
      const sel = rememberSel();
      setNotice(null);
      if (kind === "code") {
        setCode(text.slice(sel.start, sel.end));
      } else {
        setUploaded(null);
        setLinkText("");
      }
      setDialog(kind);
    },
    [rememberSel, text]
  );

  const uploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 清空选择，同一个文件再选一次也能触发 change
    e.target.value = "";
    if (!file) return;
    setNotice(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        const r = await uploadContentAssetAction(fd);
        if (!r.ok) {
          setNotice({ kind: "error", text: r.error });
          return;
        }
        setUploaded({ url: r.url, name: file.name, mime: file.type, size: file.size });
        setLinkText((prev) => prev || file.name.replace(/\.[^.]+$/, ""));
        setNotice({ kind: "ok", text: "已上传并存入素材库，点「插入」写入正文。" });
      } catch (err) {
        setNotice({ kind: "error", text: `上传失败：${(err as Error).message}` });
      }
    });
  };

  const uploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setNotice(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        const r = await uploadContentFileAction(fd);
        if (!r.ok) {
          setNotice({ kind: "error", text: r.error });
          return;
        }
        setUploaded({ url: r.url, name: r.filename, mime: r.mime, size: r.size });
        setLinkText(r.filename);
        setNotice({ kind: "ok", text: "已上传并存入素材库，点「插入」在光标处生成下载链接。" });
      } catch (err) {
        setNotice({ kind: "error", text: `上传失败：${(err as Error).message}` });
      }
    });
  };

  /** 没上传时也允许插入：地址槽留 https:// 占位，光标停在里面，稍后补地址 */
  const insertImage = () => {
    const alt = linkText || uploaded?.name || "";
    const url = uploaded?.url ?? "https://";
    const snippet = `![${alt}](${url})`;
    insert(snippet, false, snippet.length - 1);
    closeDialog();
  };

  const insertFile = () => {
    if (!uploaded) return;
    insert(`[${linkText || uploaded.name}](${uploaded.url})`);
    closeDialog();
  };

  /** 内容留空则插入空围栏，光标停在围栏内的空行上，稍后直接敲代码 */
  const insertCode = () => {
    const open = "```" + lang + "\n";
    const body = code.replace(/\s+$/, "");
    if (!body.trim()) {
      insert(open + "```", true, open.length);
    } else {
      insert(open + body + "\n```", true);
    }
    closeDialog();
  };

  /** 工具栏按钮对应哪个弹窗；投稿页的图片仍走纯语法包裹 */
  const dialogOf = (key: string): DialogKind | null => {
    if (key === "code") return "code";
    if (key === "file") return "file";
    if (mediaPicker && key === "image") return "image";
    return null;
  };

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
        openDialog("code");
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        if (mediaPicker) openDialog("image");
        else apply({ kind: "wrap", before: "![", after: "](https://)", placeholder: "图片说明" });
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
  }, [apply, openDialog, mediaPicker]);

  const html = mode === "preview" ? renderMarkdownSync(text) : "";
  const words = text.replace(/\s/g, "").length;

  return (
    <div className="md-editor">
      <div className="md-toolbar">
        {TOOLS.map((t) => {
          if (t.sep) return <span key={t.key} className="md-sep" />;
          if (ADMIN_ONLY[t.key] && !mediaPicker) return null;
          if (t.key === "media") {
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
          const kind = dialogOf(t.key);
          return (
            <button
              key={t.key}
              type="button"
              className="md-btn"
              title={t.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={kind ? () => openDialog(kind) : () => apply(t.action)}
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
                    insert(
                      isImageMedia(m)
                        ? `![${m.filename}](${m.url})`
                        : `[${m.filename}](${m.url})`
                    );
                    setPickerOpen(false);
                  }}
                >
                  {isImageMedia(m) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt={m.filename} />
                  ) : (
                    <span className="md-picker-file">{m.filename}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {dialog === "image" ? (
        <EditorModal
          title="插入图片"
          hint="选本地图片上传，会同时存入素材库；点「插入」写入正文光标处。还没上传也可以先插一个空图片，稍后再把地址补进括号里。"
          onClose={closeDialog}
        >
          <div className="input-row">
            <span className="hint truncate" title={uploaded?.name}>
              {uploaded
                ? `${uploaded.name} · ${formatSize(uploaded.size)}`
                : "支持 PNG / JPEG / GIF / WebP / AVIF / SVG 等，单张上限 8MB"}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={pending}
              onClick={() => imgInputRef.current?.click()}
            >
              {pending ? "上传中…" : uploaded ? "更换图片" : "选择图片"}
            </button>
          </div>
          {uploaded ? (
            <div className="md-upload-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={uploaded.url} alt={uploaded.name} />
            </div>
          ) : null}
          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <label className="label">图片说明（alt，可选）</label>
            <input
              className="input"
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="读屏与图片加载失败时显示的文字"
            />
          </div>
          <DialogFoot
            notice={notice}
            okDisabled={pending}
            onCancel={closeDialog}
            onOk={insertImage}
          />
          <input
            ref={imgInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,image/x-icon,image/svg+xml,.svg"
            hidden
            onChange={uploadImage}
          />
        </EditorModal>
      ) : null}

      {dialog === "file" ? (
        <EditorModal
          title="添加文件"
          hint="上传附件并写入正在编辑的文章，同时在素材库留档；正文里生成下载链接。"
          onClose={closeDialog}
        >
          <div className="input-row">
            <span className="hint truncate" title={uploaded?.name}>
              {uploaded
                ? `${uploaded.name} · ${formatSize(uploaded.size)}`
                : "文档 / 压缩包 / 音视频 / 图片 / 纯文本，单个上限 20MB"}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={pending}
              onClick={() => fileInputRef.current?.click()}
            >
              {pending ? "上传中…" : uploaded ? "更换文件" : "选择文件"}
            </button>
          </div>
          {uploaded ? (
            <div className="md-upload-preview">
              {uploaded.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={uploaded.url} alt={uploaded.name} />
              ) : (
                <div className="md-upload-file">
                  <strong>{uploaded.name}</strong>
                  <span className="text-muted text-sm">
                    {uploaded.mime || "未知类型"} · {formatSize(uploaded.size)}
                  </span>
                  <a href={uploaded.url} target="_blank" rel="noreferrer">
                    打开 / 下载
                  </a>
                </div>
              )}
            </div>
          ) : null}
          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <label className="label">链接文字</label>
            <input
              className="input"
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder={uploaded?.name ?? "正文里显示的文字"}
            />
          </div>
          <DialogFoot
            notice={notice}
            okDisabled={!uploaded || pending}
            onCancel={closeDialog}
            onOk={insertFile}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_ACCEPT}
            hidden
            onChange={uploadFile}
          />
        </EditorModal>
      ) : null}

      {dialog === "code" ? (
        <EditorModal
          title="插入代码块"
          hint="选语言、填内容，点「插入」写入正文光标处。选中过的文字会自动带进来；内容留空就先插一个空代码块，光标停在里面，回头接着写。"
          onClose={closeDialog}
        >
          <div className="field">
            <label className="label">语言</label>
            <select
              className="select"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              {CODE_LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label">代码内容（可选，留空插入空代码块）</label>
            <textarea
              className="textarea md-code-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="把代码粘贴在这里…"
              spellCheck={false}
            />
          </div>
          <DialogFoot
            notice={notice}
            onCancel={closeDialog}
            onOk={insertCode}
          />
        </EditorModal>
      ) : null}
    </div>
  );
}
