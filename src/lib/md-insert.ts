/**
 * 编辑器往正文写入内容时的纯计算，抽出来是为了能直接跑断言
 * （markdown-editor 是客户端组件，单测起不来）。
 */

export type Sel = { start: number; end: number };

export type Splice = { text: string; start: number; end: number };

/**
 * 围栏代码、表格这类块级语法必须自己占一段：紧贴上一行会渲染成纯文本。
 * 返回块级片段前后需要补的空行。
 */
export function blockPad(head: string, tail: string): {
  lead: string;
  trail: string;
} {
  const lead = head && !/\n\n$/.test(head) ? (/\n$/.test(head) ? "\n" : "\n\n") : "";
  const trail =
    tail && !/^\n\n/.test(tail) ? (tail.startsWith("\n") ? "\n" : "\n\n") : "";
  return { lead, trail };
}

/**
 * 行内片段（图片、链接）：直接替换选区。
 * caretIn 给定时光标停在片段内的这个偏移，否则停在片段之后。
 */
export function spliceInline(
  text: string,
  sel: Sel,
  snippet: string,
  caretIn?: number
): Splice {
  const next = text.slice(0, sel.start) + snippet + text.slice(sel.end);
  const caret = sel.start + (caretIn ?? snippet.length);
  return { text: next, start: caret, end: caret };
}

/** 块级片段（代码块）：先补足空行再替换选区，光标规则同上 */
export function spliceBlock(
  text: string,
  sel: Sel,
  block: string,
  caretIn?: number
): Splice {
  const head = text.slice(0, sel.start);
  const tail = text.slice(sel.end);
  const { lead, trail } = blockPad(head, tail);
  const next = head + lead + block + trail + tail;
  const caret = sel.start + lead.length + (caretIn ?? block.length);
  return { text: next, start: caret, end: caret };
}
