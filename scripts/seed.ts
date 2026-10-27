import "./load-env";
import mysql from "mysql2/promise";

/**
 * 本地开发种子数据（knav 自有表结构）。
 * 用于本地全链路测试（列表 / 详情 / 搜索 / 投稿 / 审核 / 导入）。
 *
 * 会清空内容相关表，请勿在生产库运行。
 *
 * 用法: npx tsx scripts/seed.ts
 */

const cfg = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "knav_dev",
};

/** 分类树：parent 为上级分类的 key */
const CATEGORIES: { key: string; name: string; slug: string; parent?: string; icon: string }[] = [
  { key: "common", name: "常用推荐", slug: "changyongtuijian", icon: "star" },
  { key: "search", name: "搜索引擎", slug: "sousuoyinqing", parent: "common", icon: "search" },
  { key: "effi", name: "效率工具", slug: "xiaolvigongju", parent: "common", icon: "zap" },
  { key: "vps", name: "VPS相关", slug: "vpstuijian", icon: "server" },
  { key: "cloud", name: "云服务商", slug: "yunfuwushang", parent: "vps", icon: "cloud" },
  { key: "panel", name: "管理面板", slug: "guanlianmianban", parent: "vps", icon: "layout" },
  { key: "airport", name: "机场相关", slug: "jc", icon: "globe" },
  { key: "router", name: "软路由", slug: "luyouqi", icon: "wifi" },
  { key: "openwrt", name: "OpenWrt", slug: "openwrt", parent: "router", icon: "router" },
  { key: "firmware", name: "固件下载", slug: "xiazai", parent: "router", icon: "download" },
  { key: "nas", name: "NAS相关", slug: "nasxiangguan", icon: "hard-drive" },
  { key: "nettool", name: "网络工具", slug: "wangluogongju", icon: "activity" },
  { key: "soft", name: "实用软件", slug: "shiyongruanjian", icon: "package" },
  { key: "unzip", name: "解压工具", slug: "jieya", parent: "soft", icon: "archive" },
  { key: "downloader", name: "下载器", slug: "xiazaizi", parent: "soft", icon: "download" },
  { key: "ai", name: "AI人工智能", slug: "airengongzhineng", icon: "cpu" },
  { key: "site", name: "建站相关", slug: "jianzhanxiangguan", icon: "code" },
  { key: "book", name: "书籍学习", slug: "shujixuexi", icon: "book" },
];

const TAGS = ["AI", "AIGC", "VPS", "开源", "Windows", "教程", "下载"];

/** 网址收藏 */
const SITES: {
  title: string;
  url: string;
  cat: string;
  tags: string[];
  views: number;
  excerpt: string;
}[] = [
  { title: "豆包Ai × 字节跳动", url: "https://www.doubao.com/chat", cat: "ai", tags: ["AI", "AIGC"], views: 81821, excerpt: "豆包是你的 AI 聊天智能对话问答助手，写作文案翻译情感陪伴编程全能工具。" },
  { title: "DeepSeek", url: "https://chat.deepseek.com/", cat: "ai", tags: ["AI"], views: 65432, excerpt: "DeepSeek, unravel the mystery of AGI with curiosity." },
  { title: "ChatGPT", url: "https://chat.openai.com/", cat: "ai", tags: ["AI"], views: 52310, excerpt: "ChatGPT 是 OpenAI 开发的人工智能聊天机器人。" },
  { title: "Claude", url: "https://claude.ai/", cat: "ai", tags: ["AI"], views: 44120, excerpt: "Claude 是由 Anthropic 开发的人工智能助手。" },
  { title: "Google 搜索", url: "https://www.google.com/", cat: "search", tags: [], views: 30210, excerpt: "Google 提供的网页搜索服务。" },
  { title: "Bing 搜索", url: "https://www.bing.com/", cat: "search", tags: [], views: 12870, excerpt: "微软必应搜索。" },
  { title: "1Panel", url: "https://1panel.cn/", cat: "panel", tags: ["VPS", "开源"], views: 28900, excerpt: "1Panel 是一款开源的 Linux 服务器运维管理面板。" },
  { title: "宝塔面板", url: "https://www.bt.cn/", cat: "panel", tags: ["VPS"], views: 24100, excerpt: "宝塔 Linux 面板，一键安装与管理网站环境。" },
  { title: "DDNS-GO", url: "https://github.com/jeessy2/ddns-go", cat: "vps", tags: ["开源"], views: 22150, excerpt: "DDNS-GO 是一个轻量的 DDNS 动态域名解析程序。" },
  { title: "3x-ui", url: "https://github.com/MHSanaei/3x-ui", cat: "vps", tags: ["开源"], views: 19870, excerpt: "3x-ui 是一个基于 Xray 的 Web 管理面板。" },
  { title: "NodeSeek", url: "https://www.nodeseek.com/", cat: "airport", tags: ["VPS"], views: 17600, excerpt: "NodeSeek 旨在为主机爱好者打造高品质社区。" },
  { title: "免费图床", url: "https://img.example.com/", cat: "site", tags: ["开源"], views: 9800, excerpt: "自建免费图床服务。" },
  { title: "MDN Web Docs", url: "https://developer.mozilla.org/zh-CN/", cat: "site", tags: ["教程"], views: 15300, excerpt: "Web 开发者的权威文档。" },
  { title: "Awesome OpenWrt", url: "https://github.com/wukko/cf-argo-vpn", cat: "openwrt", tags: ["开源", "下载"], views: 7600, excerpt: "OpenWrt 相关项目与插件合集。" },
  { title: "NAS 在线", url: "https://www.nas.cn/", cat: "nas", tags: [], views: 5200, excerpt: "NAS 相关的资讯与工具。" },
];

/** 文章 */
const ARTICLES: {
  title: string;
  cat: string;
  tags: string[];
  views: number;
  date: string;
  excerpt: string;
  content: string;
}[] = [
  {
    title: "使用 acme 申请 Google CA SSL 证书",
    cat: "site",
    tags: ["教程"],
    views: 5120,
    date: "2024-11-12 10:00:00",
    excerpt: "本文介绍如何使用 acme.sh 申请 Google Trust Services 证书并自动续期。",
    content: `# 使用 acme 申请 Google CA SSL 证书

## 背景

Google Trust Services 提供免费的 DV 证书，可以通过 \`acme.sh\` 自动化签发与续期。

## 前置条件

- 一个已解析到公网 IP 的域名
- 开放 80 端口用于 HTTP 验证
- 安装 \`curl\` 与 \`cron\`

## 签发步骤

\`\`\`bash
curl https://get.acme.sh | sh -s email=your@example.com
\`\`\`

然后注册 CA：

\`\`\`bash
~/.acme.sh/acme.sh --set-default-ca --server letsencrypt
\`\`\`

> 注意：Google CA 使用的是 \`google\` 通道，需要单独注册。

## 常见问题

如果验证失败，先确认 DNS 是否已生效：

\`\`\`bash
nslookup yourdomain.com
\`\`\`
`,
  },
  {
    title: "NAS 家庭服务器折腾记：从零搭建影音库",
    cat: "nas",
    tags: ["教程"],
    views: 3480,
    date: "2024-12-03 14:30:00",
    excerpt: "记录我用一台旧笔记本搭建家庭 NAS 的全过程，包括硬件选型、系统安装与媒体库管理。",
    content: `# NAS 家庭服务器折腾记

## 为什么想折腾 NAS

存储便宜了之后，把散落各处的照片、影音统一管理成了刚需。

## 硬件选型

| 部件 | 型号 | 备注 |
| --- | --- | --- |
| 主板 | 华南 X99 | 二手 |
| CPU | Xeon E5-2680 v4 | 20 核，够用 |
| 内存 | 32GB ECC | 二手 |
| 硬盘 | 4 x 8TB | RAID5 |

## 系统安装

安装 TrueNAS SCALE，导入硬盘组成 ZFS 镜像池。

## 媒体库管理

使用 \`Jellyfin\` 做影视刮削，\`*arr\` 系列工具自动追剧。
`,
  },
  {
    title: "VPS 选购避坑指南：线路、带宽与商家对比",
    cat: "vps",
    tags: ["VPS"],
    views: 2960,
    date: "2025-01-15 09:20:00",
    excerpt: "从线路类型、带宽计费、商家信誉三个维度，梳理 VPS 选购时真正该看的东西。",
    content: `# VPS 选购避坑指南

## 线路：先看，晚看就没了

- **CN2 GIA**：贵，但稳定
- **AS9929 / AS4837**：性价比之选
- **普通 163**：高峰期丢包严重

## 带宽：小心按流量计费

很多商家宣传 "1Gbps 端口"，实际是共享带宽，且流量用完即限速。

## 建议

先买月付测试，晚高峰跑个 speedtest 和 ping。
`,
  },
];

/** 软件（平台版本 + 镜像链接） */
const APPS: {
  title: string;
  cat: string;
  tags: string[];
  views: number;
  date: string;
  excerpt: string;
  versions: {
    platform: string;
    arch: string;
    version: string;
    size: string;
    mirrors: { name: string; url: string }[];
  }[];
}[] = [
  {
    title: "Windows Enterprise LTSC 2024",
    cat: "soft",
    tags: ["Windows", "下载"],
    views: 21305,
    date: "2024-12-12 08:00:00",
    excerpt: "官方版 无广告",
    versions: [
      {
        platform: "Windows",
        arch: "x64",
        version: "2024",
        size: "5.2 GB",
        mirrors: [
          { name: "官方下载", url: "https://dl.example.com/win11-ltsc-2024.zip" },
          { name: "百度网盘", url: "https://pan.baidu.com/s/example-ltsc-2024" },
        ],
      },
    ],
  },
  {
    title: "OpenWrt 24.10 固件 (immortalwrt)",
    cat: "firmware",
    tags: ["开源", "下载"],
    views: 18240,
    date: "2025-02-01 11:00:00",
    excerpt: "软路由常用固件",
    versions: [
      {
        platform: "OpenWrt",
        arch: "x86_64",
        version: "24.10.0",
        size: "128 MB",
        mirrors: [{ name: "官方下载", url: "https://dl.example.com/immortalwrt-24.10.img.gz" }],
      },
      {
        platform: "OpenWrt",
        arch: "aarch64",
        version: "24.10.0",
        size: "122 MB",
        mirrors: [{ name: "官方下载", url: "https://dl.example.com/immortalwrt-24.10-arm64.img.gz" }],
      },
    ],
  },
  {
    title: "7-Zip 压缩工具",
    cat: "unzip",
    tags: ["Windows"],
    views: 12400,
    date: "2024-10-02 09:00:00",
    excerpt: "开源免费压缩软件",
    versions: [
      {
        platform: "Windows",
        arch: "x64",
        version: "24.08",
        size: "1.6 MB",
        mirrors: [
          { name: "官方下载", url: "https://www.7-zip.org/a/7z2408-x64.exe" },
          { name: "GitHub", url: "https://github.com/ip7z/7zip/releases" },
        ],
      },
    ],
  },
  {
    title: "aria2 多线程下载器",
    cat: "downloader",
    tags: ["开源"],
    views: 9300,
    date: "2024-11-20 16:30:00",
    excerpt: "轻量高效的多线程下载工具",
    versions: [
      {
        platform: "Linux",
        arch: "x64",
        version: "1.37.0",
        size: "3.1 MB",
        mirrors: [{ name: "GitHub", url: "https://github.com/aria2/aria2/releases" }],
      },
    ],
  },
];

async function main() {
  const conn = await mysql.createConnection({ ...cfg, multipleStatements: true });

  console.log("清空内容相关表...");
  for (const t of [
    "knav_content_tags",
    "knav_content_links",
    "knav_download_mirrors",
    "knav_downloads",
    "knav_favorites",
    "knav_submissions",
    "knav_contents",
    "knav_tags",
    "knav_categories",
  ]) {
    await conn.query(`TRUNCATE TABLE \`${t}\``);
  }

  // 分类
  console.log("写入分类...");
  const catId = new Map<string, number>();
  for (const c of CATEGORIES) {
    const parentId = c.parent ? catId.get(c.parent) ?? 0 : 0;
    const [ins] = await conn.query(
      `INSERT INTO knav_categories (parent_id, name, slug, icon, sort_order) VALUES (?,?,?,?,?)`,
      [parentId, c.name, c.slug, c.icon, CATEGORIES.indexOf(c)]
    );
    catId.set(c.key, Number((ins as any).insertId));
  }

  // 标签
  console.log("写入标签...");
  const tagId = new Map<string, number>();
  for (const t of TAGS) {
    const [ins] = await conn.query(`INSERT INTO knav_tags (name, slug) VALUES (?,?)`, [
      t,
      t.toLowerCase(),
    ]);
    tagId.set(t, Number((ins as any).insertId));
  }

  const insertTags = async (contentId: number, tags: string[]) => {
    for (const t of tags) {
      const id = tagId.get(t);
      if (!id) continue;
      await conn.query(
        `INSERT IGNORE INTO knav_content_tags (content_id, tag_id) VALUES (?,?)`,
        [contentId, id]
      );
    }
  };

  // 网址
  console.log("写入网址...");
  for (const s of SITES) {
    const [ins] = await conn.query(
      `INSERT INTO knav_contents
         (type, title, slug, url, description, icon, category_id, views, likes, sort_order, status, created_at, updated_at)
       VALUES ('site',?,?,?,?,?,?,?,0,?,'publish',?,?)`,
      [
        s.title,
        s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `site-${Date.now()}`,
        s.url,
        s.excerpt,
        `https://cdn.example.com/seed-${encodeURIComponent(s.title)}.png`,
        catId.get(s.cat) ?? 0,
        s.views,
        SITES.indexOf(s),
        "2025-02-23 07:26:40",
        "2025-02-23 07:26:40",
      ]
    );
    await insertTags(Number((ins as any).insertId), s.tags);
  }

  // 文章
  console.log("写入文章...");
  for (const a of ARTICLES) {
    const [ins] = await conn.query(
      `INSERT INTO knav_contents
         (type, title, slug, url, description, content_md, category_id, views, likes, sort_order, status, created_at, updated_at)
       VALUES ('article',?,?,'',?,?,?,?,0,?,'publish',?,?)`,
      [
        a.title,
        `article-${a.date.replace(/[^0-9]/g, "")}`,
        a.excerpt,
        a.content,
        catId.get(a.cat) ?? 0,
        a.views,
        ARTICLES.indexOf(a),
        a.date,
        a.date,
      ]
    );
    await insertTags(Number((ins as any).insertId), a.tags);
  }

  // 软件
  console.log("写入软件...");
  for (const ap of APPS) {
    const [ins] = await conn.query(
      `INSERT INTO knav_contents
         (type, title, slug, url, description, category_id, views, likes, sort_order, status, created_at, updated_at)
       VALUES ('app',?,?,'',?,?,?,0,?,'publish',?,?)`,
      [
        ap.title,
        `app-${ap.date.replace(/[^0-9]/g, "")}`,
        ap.excerpt,
        catId.get(ap.cat) ?? 0,
        ap.views,
        APPS.indexOf(ap),
        ap.date,
        ap.date,
      ]
    );
    const contentId = Number((ins as any).insertId);
    await insertTags(contentId, ap.tags);

    let sort = 0;
    for (const v of ap.versions) {
      const [dIns] = await conn.query(
        `INSERT INTO knav_downloads
           (content_id, resource_title, platform, arch, version, file_size, enabled, sort_order)
         VALUES (?,?,?,?,?,?,1,?)`,
        [contentId, ap.title, v.platform, v.arch, v.version, v.size, sort++]
      );
      const downloadId = Number((dIns as any).insertId);
      let mSort = 0;
      for (const m of v.mirrors) {
        await conn.query(
          `INSERT INTO knav_download_mirrors (download_id, name, url, enabled, sort_order) VALUES (?,?,?,1,?)`,
          [downloadId, m.name, m.url, mSort++]
        );
      }
    }
  }

  // 刷新计数
  const [catRows] = await conn.query<any[]>(
    "SELECT id, parent_id FROM knav_categories"
  );
  const [directRows] = await conn.query<any[]>(
    "SELECT category_id, COUNT(*) AS n FROM knav_contents WHERE status='publish' GROUP BY category_id"
  );
  const direct = new Map<number, number>();
  for (const r of directRows) direct.set(Number(r.category_id), Number(r.n));
  const childrenOf = new Map<number, number[]>();
  for (const r of catRows) {
    const p = Number(r.parent_id) || 0;
    if (!p) continue;
    const list = childrenOf.get(p) ?? [];
    list.push(Number(r.id));
    childrenOf.set(p, list);
  }
  const rolled = new Map<number, number>();
  const rollup = (id: number): number => {
    if (rolled.has(id)) return rolled.get(id)!;
    let acc = direct.get(id) ?? 0;
    rolled.set(id, acc);
    for (const child of childrenOf.get(id) ?? []) acc += rollup(child);
    rolled.set(id, acc);
    return acc;
  };
  for (const r of catRows) {
    await conn.query("UPDATE knav_categories SET content_count = ? WHERE id = ?", [
      rollup(Number(r.id)),
      Number(r.id),
    ]);
  }
  await conn.query(
    `UPDATE knav_tags t SET t.count = (
       SELECT COUNT(*) FROM knav_content_tags ct
         JOIN knav_contents c ON c.id = ct.content_id AND c.status = 'publish'
        WHERE ct.tag_id = t.id
     )`
  );

  const [counts] = await conn.query(
    `SELECT type, COUNT(*) AS n FROM knav_contents GROUP BY type`
  );
  console.log("种子数据完成:", counts);

  await conn.end();
}

main().catch((e) => {
  console.error("种子失败:", e);
  process.exit(1);
});
