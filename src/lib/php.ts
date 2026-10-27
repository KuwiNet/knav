/**
 * 极简 PHP serialize 解析器。
 *
 * OneNav 主题把备用地址、下载版本等结构化数据以 PHP 序列化字符串存在 postmeta 里，
 * 例如：
 *   a:1:{i:0;a:9:{s:11:"app_version";s:8:"17.45.36";s:8:"down_url";a:2:{...}}}
 *
 * 只实现站点实际用到的类型：N / b / i / d / s / a，够用且没有额外依赖。
 * 字符串长度是**字节数**，所以内部统一按 UTF-8 字节解析。
 */

/** 解析一个 PHP 序列化字符串；失败返回 null */
export function phpUnserialize(raw: string): any {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const bytes = new TextEncoder().encode(raw);
    const st: State = { b: bytes, i: 0 };
    return readValue(st);
  } catch {
    return null;
  }
}

interface State {
  b: Uint8Array;
  i: number;
}

const decoder = new TextDecoder("utf-8");

function readValue(st: State): any {
  const type = String.fromCharCode(st.b[st.i]);
  switch (type) {
    case "N":
      expect(st, "N;");
      return null;
    case "b": {
      expect(st, "b:");
      const raw = readUntil(st, ";");
      expect(st, ";");
      return raw === "1";
    }
    case "i": {
      expect(st, "i:");
      const raw = readUntil(st, ";");
      expect(st, ";");
      return Number.parseInt(raw, 10);
    }
    case "d": {
      expect(st, "d:");
      const raw = readUntil(st, ";");
      expect(st, ";");
      return Number.parseFloat(raw);
    }
    case "s": {
      expect(st, "s:");
      const len = Number.parseInt(readUntil(st, ":"), 10);
      expect(st, ':"');
      const value = decoder.decode(st.b.slice(st.i, st.i + len));
      st.i += len;
      expect(st, '";');
      return value;
    }
    case "a": {
      expect(st, "a:");
      const count = Number.parseInt(readUntil(st, ":"), 10);
      expect(st, ":{");
      const out: Record<string, any> = {};
      for (let n = 0; n < count; n++) {
        const key = readValue(st);
        const val = readValue(st);
        out[String(key)] = val;
      }
      expect(st, "}");
      return out;
    }
    default:
      throw new Error(`未知类型: ${type}`);
  }
}

function expect(st: State, token: string): void {
  const t = new TextEncoder().encode(token);
  for (let k = 0; k < t.length; k++) {
    if (st.b[st.i + k] !== t[k]) {
      throw new Error(`期望 ${token} @${st.i}`);
    }
  }
  st.i += t.length;
}

function readUntil(st: State, stop: string): string {
  const t = new TextEncoder().encode(stop);
  outer: for (let k = st.i; k < st.b.length - t.length + 1; k++) {
    for (let j = 0; j < t.length; j++) {
      if (st.b[k + j] !== t[j]) continue outer;
    }
    const out = decoder.decode(st.b.slice(st.i, k));
    st.i = k;
    return out;
  }
  throw new Error(`未找到 ${stop}`);
}

/**
 * 从 PHP 序列化数组里取出列表（PHP 数组的键是 0,1,2...）。
 * 返回按数字键升序排列的数组。
 */
export function phpArrayToList(value: any): any[] {
  if (!value || typeof value !== "object") return [];
  return Object.keys(value)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => value[k]);
}

/**
 * 序列化成 PHP 的 serialize() 格式。
 *
 * 后台新建的下载/应用需要写回 OneNav 的私有 meta
 * （_app_platform / app_down_list），格式必须与 WordPress 侧一致，
 * 否则线上老站读取会失败。
 */
export function phpSerialize(value: any): string {
  if (value === null || value === undefined) return "N;";
  if (typeof value === "boolean") return value ? "b:1;" : "b:0;";
  if (typeof value === "number") {
    return Number.isInteger(value) ? `i:${value};` : `d:${value};`;
  }
  if (typeof value === "string") {
    // PHP 字符串长度按字节计算
    const bytes = Buffer.byteLength(value, "utf8");
    return `s:${bytes}:"${value}";`;
  }
  if (Array.isArray(value)) {
    const body = value
      .map((v, i) => `${i}:${phpSerialize(v)}`)
      .join("");
    return `a:${value.length}:{${body}}`;
  }
  if (typeof value === "object") {
    const body = Object.entries(value)
      .map(([k, v]) => `${phpSerialize(k)}:${phpSerialize(v)}`)
      .join("");
    return `a:${Object.keys(value).length}:{${body}}`;
  }
  return "N;";
}

