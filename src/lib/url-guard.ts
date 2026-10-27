// server-only 守卫：仅在 Next.js 运行时生效，独立脚本(tsx)下跳过
if (process.env.NEXT_RUNTIME !== undefined) {
  require("server-only");
}

import { promises as dns } from "node:dns";
import net from "node:net";

/**
 * 地址可达性守卫（防 SSRF）。
 *
 * 「获取信息」这类功能会让服务器去请求用户填的地址。管理员用没问题，
 * 但开放给注册用户后，随便一句 `http://127.0.0.1:3307` 或
 * `http://169.254.169.254/latest/meta-data/` 就把服务器变成了内网探针，
 * 所以走公网用户的路径必须先确认目标是公网地址。
 */

/** 只在本地/内网解析器里出现的后缀 */
const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".localdomain",
];

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // 解析不了的一律当不安全
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // 链路本地 + 云厂商元数据
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 IANA 保留段
  if (a === 198 && (b === 18 || b === 19)) return true; // 基准测试
  if (a >= 224) return true; // 组播与保留
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^::ffff:/, "");
  if (s === "::" || s === "::1") return true;
  if (s.startsWith("fc") || s.startsWith("fd")) return true; // 唯一本地地址
  if (s.startsWith("fe8")) return true; // link-local
  if (net.isIPv4(s)) return ipv4IsPrivate(s);
  return false;
}

export function ipIsPrivate(ip: string): boolean {
  const v = ip.trim().replace(/^\[|\]$/g, "");
  if (net.isIPv4(v)) return ipv4IsPrivate(v);
  if (net.isIPv6(v)) return ipv6IsPrivate(v);
  return true; // 不是合法 IP 就当私有，交给调用方报错
}

/**
 * 校验地址是否可以让服务器去访问。
 * 返回规范化后的 URL；命中内网/保留地址时给出面向用户的错误文案。
 */
export async function assertPublicHttpUrl(
  raw: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let input = (raw || "").trim();
  if (!input) return { ok: false, error: "请先填写网址" };
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, error: "网址格式不正确" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "只支持 http / https 地址" };
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, error: "网址里没有域名" };
  if (
    host === "localhost" ||
    BLOCKED_SUFFIXES.some((s) => host.endsWith(s)) ||
    !host.includes(".")
  ) {
    return { ok: false, error: "这个地址不能抓取（内网或本地地址）" };
  }

  if (net.isIP(host)) {
    if (ipIsPrivate(host)) {
      return { ok: false, error: "这个地址不能抓取（内网或保留地址）" };
    }
    return { ok: true, url: parsed.toString() };
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return { ok: false, error: "域名解析失败，检查下网址是否写错" };
  }
  if (addresses.length === 0) return { ok: false, error: "域名解析不到地址" };
  if (addresses.some((a) => ipIsPrivate(a.address))) {
    return { ok: false, error: "这个地址不能抓取（解析到内网地址）" };
  }
  return { ok: true, url: parsed.toString() };
}
