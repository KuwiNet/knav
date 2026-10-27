/**
 * 汉字 → 拼音首字母（不引第三方词典）。
 *
 * 原理：Intl 的拼音排序（zh-u-co-pinyin）按读音给中文排序，
 * 于是「在 21 个声母代表字里，找排在目标字之前的最大那一个」就能定位它的声母。
 * 只能拿到首字母、拿不到全拼——分类别名只要首字母，够用。
 *
 * 这个文件必须保持纯净（无数据库、无 server-only），后台表单是客户端组件。
 */

/** 每个声母的排序下界代表字（a/啊、b/八、c/擦 ……） */
const BOUNDS = [
  "阿", "八", "擦", "搭", "蛾", "发", "噶", "哈", "击", "喀",
  "垃", "妈", "拿", "哦", "啪", "期", "然", "撒", "塌", "挖",
  "昔", "压", "匝",
];
const INITIALS = [
  "a", "b", "c", "d", "e", "f", "g", "h", "j", "k",
  "l", "m", "n", "o", "p", "q", "r", "s", "t", "w",
  "x", "y", "z",
];

const COLLATION = "zh-Hans-CN-u-co-pinyin";

/** 别名长度上限：留出后缀空间，也要落在列宽内 */
const MAX_LENGTH = 60;

let collationUsable: boolean | null = null;

/**
 * 运行时是否真的带拼音排序数据。
 * 缺 ICU 时 localeCompare 会静默按码位排序，产出看着像别名、其实全错，所以必须先自检。
 */
export function hasPinyinCollation(): boolean {
  if (collationUsable === null) {
    try {
      collationUsable =
        "阿".localeCompare("八", COLLATION) < 0 &&
        "八".localeCompare("擦", COLLATION) < 0 &&
        "张".localeCompare("赵", COLLATION) < 0;
    } catch {
      collationUsable = false;
    }
  }
  return collationUsable;
}

/** 取单个汉字的声母字母；取不到返回 null */
function initialOf(ch: string): string | null {
  for (let i = BOUNDS.length - 1; i >= 0; i--) {
    if (BOUNDS[i].localeCompare(ch, COLLATION) <= 0) return INITIALS[i];
  }
  return null;
}

/**
 * 名称 → 别名。
 *
 * 英文和数字原样保留，汉字取声母，空格与标点折成连字符：
 * 「常用推荐」→ cytj，「VPS相关」→ vpsxg，「AI人工智能」→ airgzn。
 * 名称里有汉字但运行时没拼音数据时返回空串，由调用方提示用户手填。
 */
export function pinyinInitials(text: string): string {
  const value = (text ?? "").trim();
  if (!value) return "";
  if (/\p{Script=Han}/u.test(value) && !hasPinyinCollation()) return "";

  const out: string[] = [];
  for (const ch of value) {
    if (/[a-z0-9]/i.test(ch)) {
      out.push(ch.toLowerCase());
    } else if (/\p{Script=Han}/u.test(ch)) {
      const initial = initialOf(ch);
      if (initial) out.push(initial);
    } else if (/[\s_·、，,。.\/|]+/.test(ch)) {
      out.push("-");
    }
    // 其余字符（表情、符号）直接忽略
  }

  return out
    .join("")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, "");
}
