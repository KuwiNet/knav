import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 自动部署时用 NEXT_DIST_DIR=.next-build 构建，成功后再整体替换 .next，
  // 避免构建过程覆盖正在运行的服务
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 关掉开发模式左下角的 Next.js 指示器（那个 "N" 按钮，界面是英文的，
  // 生产构建里本来就不存在，这里只影响本地 npm run dev）
  devIndicators: false,
  experimental: {
    // Node 18 环境下的 serverExternalPackages，避免构建期打包原生依赖
    serverActions: {
      // 「数据迁移」要能上传整份 MySQL 备份文件，8MB 装不下来自站点的导出
      bodySizeLimit: "64mb",
    },
  },
  async rewrites() {
    // /uploads 全部交给动态路由（src/app/media/[...path]/route.ts）：
    // 1. 静态服务对 public 文件只给 max-age=0，经 Cloudflare 每次回源校验，慢链路上图标要等十几秒；
    // 2. 启动后才写入的上传文件不在 public 快照里，静态匹配会 404，重启才恢复。
    // 重写到 /media 是为了不落到静态服务，/media 本身也可直接访问，无副作用。
    return {
      beforeFiles: [
        { source: "/uploads/:path*", destination: "/media/:path*" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
