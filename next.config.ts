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
};

export default nextConfig;
