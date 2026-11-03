/**
 * 数据库连接配置解析。
 *
 * 纯函数、无副作用，应用运行时（src/lib/db.ts）和 scripts/ 下的命令行工具共用同一份，
 * 避免出现「应用能连、迁移脚本连不上」这种两边配置不一致的情况。
 *
 * 两种填法，SQL 方言与表结构完全一致，只是连接来源不同：
 *   1. DB_HOST / DB_PORT / DB_USER / DB_PASS / DB_NAME —— 自建 MySQL、内网 RDS、Docker；
 *   2. DATABASE_URL=mysql://user:pass@host:3306/db —— 托管库（PlanetScale、TiDB Serverless）
 *      和 Cloudflare Hyperdrive 通常只发一条串，mysql:// 开头时优先于 DB_*。
 *
 * TLS：URL 模式默认开启，显式 ?sslmode=disable 才走明文；证书校验不过时可用 ?sslmode=no-verify。
 * DB_MODE=edge 只给 Cloudflare Workers 用：那边禁止 eval/new Function，mysql2 要带 disableEval。
 */

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: Record<string, unknown>;
  disableEval?: boolean;
}

const DEFAULTS = {
  host: "127.0.0.1",
  port: 3307,
  user: "root",
  password: "",
  database: "knav_dev",
};

export function dbConfig(): DbConfig {
  const raw = (process.env.DATABASE_URL || "").trim();
  // 本机或镜像里可能残留别的项目的 DATABASE_URL（Postgres 之类）。本站只会说 MySQL，
  // 这种串直接忽略、退回 DB_*，免得一个跟 knav 无关的变量把整站启动顶掉。
  const url = /^mysql:\/\//i.test(raw) ? raw : "";
  if (raw && !url) {
    console.warn("[knav] DATABASE_URL 不是 mysql:// 开头，已忽略并改用 DB_* 配置");
  }

  const cfg: DbConfig = url
    ? fromUrl(url)
    : {
        host: process.env.DB_HOST || DEFAULTS.host,
        port: Number(process.env.DB_PORT || DEFAULTS.port),
        user: process.env.DB_USER || DEFAULTS.user,
        password: process.env.DB_PASS || DEFAULTS.password,
        database: process.env.DB_NAME || DEFAULTS.database,
      };

  if (process.env.DB_MODE === "edge") cfg.disableEval = true;
  return cfg;
}

function fromUrl(raw: string): DbConfig {
  const u = new URL(raw);
  const sslmode = u.searchParams.get("sslmode") || "require";
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    // 连接串里的账号密码要百分号编码，否则 @ / : 会被当成结构字符
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")),
    ssl:
      sslmode === "disable"
        ? undefined
        : sslmode === "no-verify"
          ? { rejectUnauthorized: false }
          : {},
  };
}
