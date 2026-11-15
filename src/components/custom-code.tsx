type ScriptPart =
  | { kind: "external"; src: string; attrs: Record<string, string | boolean> }
  | { kind: "inline"; content: string };

const SCRIPT_BLOCK = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const ATTR = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

// React 不认识的属性会打到控制台警告，只放行这几个和 data-*
const ALLOWED_ATTRS = new Set([
  "id",
  "async",
  "defer",
  "type",
  "nonce",
  "crossorigin",
  "referrerpolicy",
  "integrity",
  "nomodule",
]);

function parseAttrs(raw: string): Record<string, string | boolean> {
  const attrs: Record<string, string | boolean> = {};
  ATTR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR.exec(raw))) {
    const value = m[2] ?? m[3] ?? m[4];
    attrs[m[1].toLowerCase()] = value === undefined ? true : value;
  }
  return attrs;
}

/**
 * 把后台粘贴的统计代码拆成若干脚本片段。
 *
 * 不能把整段 HTML 塞进 <script dangerouslySetInnerHTML>：片段内部自带 </script>，
 * 浏览器解析到第一个 </script> 就会把外层 script 提前结束，后面的 <script src=...>
 * 被当成纯文本吞掉，外链脚本永远不会加载。
 */
export function parseCustomCode(html: string): ScriptPart[] {
  const parts: ScriptPart[] = [];
  SCRIPT_BLOCK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCRIPT_BLOCK.exec(html))) {
    const attrs = parseAttrs(m[1]);
    const src = attrs.src;
    if (typeof src === "string") {
      delete attrs.src;
      parts.push({ kind: "external", src, attrs });
    } else {
      parts.push({ kind: "inline", content: m[2] });
    }
  }
  return parts;
}

export default function CustomCode({ html }: { html: string }) {
  const parts = parseCustomCode(html);
  if (parts.length === 0) return null;
  return (
    <>
      {parts.map((part, i) =>
        part.kind === "external" ? (
          <script
            key={i}
            src={part.src}
            {...Object.fromEntries(
              Object.entries(part.attrs).filter(
                ([k, v]) =>
                  (ALLOWED_ATTRS.has(k) || k.startsWith("data-")) &&
                  v !== false
              )
            )}
          />
        ) : (
          <script key={i} dangerouslySetInnerHTML={{ __html: part.content }} />
        )
      )}
    </>
  );
}
