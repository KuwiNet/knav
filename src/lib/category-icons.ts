/**
 * 分类图标库（内置 SVG）。
 *
 * 需求：分类要有 icon，风格统一、好看。
 * 做法：内置一组 24x24 描边图标（Feather 风格），后台可直接选；
 * 前台统一由 <CategoryIcon> 渲染，保证风格一致。
 *
 * 另外允许三种自定义写法：
 *   1. 图片地址（http/https 或以 / 开头）→ <img>
 *   2. Emoji → 直接当文字渲染
 *   3. iconfont 类名（以 . 开头或含 icon- 前缀）→ <i class="...">
 */

export type IconShape =
  | { kind: "path"; d: string }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx?: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number };

export interface CategoryIconDef {
  /** 图标名（存进数据库的 icon 值） */
  value: string;
  /** 后台选择器里显示的名字 */
  label: string;
  /** 24x24 viewBox 的图形描述 */
  shapes: IconShape[];
}

export const CATEGORY_ICONS: CategoryIconDef[] = [
  {
    value: "globe",
    label: "地球 / 网站",
    shapes: [
      { kind: "path", d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" },
      { kind: "path", d: "M2 12h20" },
      { kind: "path", d: "M12 2c2.5 2.7 2.5 17.3 0 20" },
      { kind: "path", d: "M12 2c-2.5 2.7-2.5 17.3 0 20" },
    ],
  },
  {
    value: "server",
    label: "服务器",
    shapes: [
      { kind: "path", d: "M3 4h18v7H3z" },
      { kind: "path", d: "M3 13h18v7H3z" },
      { kind: "path", d: "M7 7.5h.01" },
      { kind: "path", d: "M7 16.5h.01" },
    ],
  },
  {
    value: "cloud",
    label: "云服务",
    shapes: [
      { kind: "path", d: "M17.5 19H7a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19.4 11a4 4 0 0 1-1.9 8Z" },
    ],
  },
  {
    value: "code",
    label: "代码",
    shapes: [{ kind: "path", d: "m16 18 6-6-6-6" }, { kind: "path", d: "m8 6-6 6 6 6" }],
  },
  {
    value: "terminal",
    label: "终端",
    shapes: [{ kind: "path", d: "m4 17 6-6-6-6" }, { kind: "path", d: "M12 19h8" }],
  },
  {
    value: "database",
    label: "数据库",
    shapes: [
      { kind: "path", d: "M12 2c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3Z" },
      { kind: "path", d: "M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" },
      { kind: "path", d: "M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" },
    ],
  },
  {
    value: "shield",
    label: "安全 / 防护",
    shapes: [{ kind: "path", d: "M12 2 4 5v6c0 5 3.4 9.1 8 11 4.6-1.9 8-6 8-11V5Z" }],
  },
  {
    value: "rocket",
    label: "加速 / 起飞",
    shapes: [
      { kind: "path", d: "M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" },
      { kind: "path", d: "M9 12A12 12 0 0 1 18 3c2 0 4 1 4 1s1 2 1 4a12 12 0 0 1-9 9" },
      { kind: "path", d: "m12 15-3 3" },
      { kind: "path", d: "M9 12H6l-3 3h3v3l3-3" },
    ],
  },
  {
    value: "book",
    label: "书籍 / 阅读",
    shapes: [
      { kind: "path", d: "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22Z" },
      { kind: "path", d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" },
    ],
  },
  {
    value: "video",
    label: "视频 / 影音",
    shapes: [
      { kind: "path", d: "m22 8-6 4 6 4Z" },
      { kind: "path", d: "M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z" },
    ],
  },
  {
    value: "music",
    label: "音乐",
    shapes: [
      { kind: "path", d: "M9 18V5l12-2v13" },
      { kind: "path", d: "M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" },
      { kind: "path", d: "M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" },
    ],
  },
  {
    value: "image",
    label: "图片 / 摄影",
    shapes: [
      { kind: "rect", x: 3, y: 3, w: 18, h: 18, rx: 2 },
      { kind: "circle", cx: 8.5, cy: 8.5, r: 1.5 },
      { kind: "path", d: "m21 15-5-5L5 21" },
    ],
  },
  {
    value: "camera",
    label: "相机",
    shapes: [
      { kind: "path", d: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" },
      { kind: "circle", cx: 12, cy: 13, r: 4 },
    ],
  },
  {
    value: "phone",
    label: "手机 / APP",
    shapes: [
      { kind: "path", d: "M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" },
      { kind: "path", d: "M12 18h.01" },
    ],
  },
  {
    value: "monitor",
    label: "电脑 / 桌面",
    shapes: [
      { kind: "path", d: "M2 3h20v14H2z" },
      { kind: "path", d: "M8 21h8" },
      { kind: "path", d: "M12 17v4" },
    ],
  },
  {
    value: "printer",
    label: "打印 / 硬件",
    shapes: [
      { kind: "path", d: "M6 9V2h12v7" },
      { kind: "path", d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" },
      { kind: "path", d: "M6 14h12v8H6z" },
    ],
  },
  {
    value: "package",
    label: "软件包 / 应用",
    shapes: [
      { kind: "path", d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" },
      { kind: "path", d: "m3.3 7 8.7 5 8.7-5" },
      { kind: "path", d: "M12 22V12" },
    ],
  },
  {
    value: "wifi",
    label: "网络 / 无线",
    shapes: [
      { kind: "path", d: "M5 12.55a11 11 0 0 1 14 0" },
      { kind: "path", d: "M1.42 9a16 16 0 0 1 21.16 0" },
      { kind: "path", d: "M8.53 16.11a6 6 0 0 1 6.95 0" },
      { kind: "path", d: "M12 20h.01" },
    ],
  },
  {
    value: "network",
    label: "组网 / 路由",
    shapes: [
      { kind: "path", d: "M9 2h6v6H9z" },
      { kind: "path", d: "M5 16a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" },
      { kind: "path", d: "M12 8v4" },
    ],
  },
  {
    value: "key",
    label: "密钥 / 账号",
    shapes: [
      { kind: "path", d: "m21 2-2 2" },
      { kind: "path", d: "M11.39 11.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78Z" },
      { kind: "path", d: "m11.39 11.61 4.11-4.11" },
      { kind: "path", d: "m15.5 7.5 3 3" },
      { kind: "path", d: "m18.5 4.5 3 3" },
    ],
  },
  {
    value: "lock",
    label: "隐私 / 加密",
    shapes: [
      { kind: "path", d: "M3 11h18v11H3z" },
      { kind: "path", d: "M7 11V7a5 5 0 0 1 10 0v4" },
    ],
  },
  {
    value: "user",
    label: "用户 / 账号",
    shapes: [
      { kind: "path", d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" },
      { kind: "circle", cx: 12, cy: 7, r: 4 },
    ],
  },
  {
    value: "users",
    label: "团队 / 社区",
    shapes: [
      { kind: "path", d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" },
      { kind: "path", d: "M23 21v-2a4 4 0 0 0-3-3.87" },
      { kind: "path", d: "M16 3.13a4 4 0 0 1 0 7.75" },
    ],
  },
  {
    value: "cart",
    label: "购物 / 优惠",
    shapes: [
      { kind: "path", d: "M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" },
      { kind: "circle", cx: 9, cy: 21, r: 1 },
      { kind: "circle", cx: 20, cy: 21, r: 1 },
    ],
  },
  {
    value: "tag",
    label: "标签 / 价格",
    shapes: [
      { kind: "path", d: "M20.59 13.41 12 22l-9-9V3h10l8.59 8.59a2 2 0 0 1 0 2.82Z" },
      { kind: "circle", cx: 7, cy: 7, r: 1 },
    ],
  },
  {
    value: "folder",
    label: "目录 / 资源",
    shapes: [{ kind: "path", d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z" }],
  },
  {
    value: "star",
    label: "收藏 / 推荐",
    shapes: [{ kind: "path", d: "m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z" }],
  },
  {
    value: "heart",
    label: "喜欢 / 点赞",
    shapes: [
      { kind: "path", d: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" },
    ],
  },
  {
    value: "search",
    label: "搜索 / 工具",
    shapes: [
      { kind: "circle", cx: 11, cy: 11, r: 8 },
      { kind: "path", d: "m21 21-4.35-4.35" },
    ],
  },
  {
    value: "coffee",
    label: "生活 / 闲谈",
    shapes: [
      { kind: "path", d: "M18 8h1a4 4 0 0 1 0 8h-1" },
      { kind: "path", d: "M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z" },
      { kind: "path", d: "M6 1v3" },
      { kind: "path", d: "M10 1v3" },
      { kind: "path", d: "M14 1v3" },
    ],
  },
  {
    value: "briefcase",
    label: "办公 / 效率",
    shapes: [
      { kind: "path", d: "M2 7h20v14H2z" },
      { kind: "path", d: "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" },
    ],
  },
  {
    value: "trending",
    label: "资讯 / 热门",
    shapes: [{ kind: "path", d: "m23 6-9.5 9.5-5-5L1 18" }, { kind: "path", d: "M17 6h6v6" }],
  },
  {
    value: "activity",
    label: "监控 / 状态",
    shapes: [{ kind: "path", d: "M22 12h-4l-3 9L9 3l-3 9H2" }],
  },
  {
    value: "zap",
    label: "加速 / 闪存",
    shapes: [{ kind: "path", d: "M13 2 3 14h9l-1 8 10-12h-9Z" }],
  },
  {
    value: "cpu",
    label: "CPU / 硬件",
    shapes: [
      { kind: "path", d: "M4 4h16v16H4z" },
      { kind: "path", d: "M9 9h6v6H9z" },
      { kind: "path", d: "M9 2v2" },
      { kind: "path", d: "M15 2v2" },
      { kind: "path", d: "M9 20v2" },
      { kind: "path", d: "M15 20v2" },
      { kind: "path", d: "M2 9h2" },
      { kind: "path", d: "M2 15h2" },
      { kind: "path", d: "M20 9h2" },
      { kind: "path", d: "M20 15h2" },
    ],
  },
  {
    value: "hard-drive",
    label: "硬盘 / 存储",
    shapes: [
      { kind: "path", d: "M22 12H2" },
      { kind: "path", d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" },
      { kind: "path", d: "M6 16h.01" },
      { kind: "path", d: "M10 16h.01" },
    ],
  },
  {
    value: "git-branch",
    label: "开源 / 仓库",
    shapes: [
      { kind: "circle", cx: 18, cy: 6, r: 3 },
      { kind: "circle", cx: 6, cy: 18, r: 3 },
      { kind: "path", d: "M6 3v12" },
    ],
  },
  {
    value: "download",
    label: "下载",
    shapes: [
      { kind: "path", d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" },
      { kind: "path", d: "m7 10 5 5 5-5" },
      { kind: "path", d: "M12 15V3" },
    ],
  },
  {
    value: "monitor-smartphone",
    label: "多端 / 面板",
    shapes: [
      { kind: "path", d: "M18 2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" },
      { kind: "path", d: "M11 18v4" },
      { kind: "path", d: "M8 22h6" },
      { kind: "path", d: "M2 6v12a2 2 0 0 0 2 2h3" },
    ],
  },
  {
    value: "home",
    label: "首页 / 主页",
    shapes: [
      { kind: "path", d: "M3 9.5 12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" },
      { kind: "path", d: "M9 22v-8h6v8" },
    ],
  },
  {
    value: "grid",
    label: "网格 / 面板",
    shapes: [
      { kind: "rect", x: 3, y: 3, w: 7, h: 7, rx: 1 },
      { kind: "rect", x: 14, y: 3, w: 7, h: 7, rx: 1 },
      { kind: "rect", x: 14, y: 14, w: 7, h: 7, rx: 1 },
      { kind: "rect", x: 3, y: 14, w: 7, h: 7, rx: 1 },
    ],
  },
  {
    value: "layout",
    label: "布局 / 后台",
    shapes: [
      { kind: "rect", x: 3, y: 3, w: 18, h: 18, rx: 2 },
      { kind: "line", x1: 3, y1: 9, x2: 21, y2: 9 },
      { kind: "line", x1: 9, y1: 21, x2: 9, y2: 9 },
    ],
  },
  {
    value: "archive",
    label: "归档 / 压缩",
    shapes: [
      { kind: "path", d: "M21 8v13H3V8" },
      { kind: "path", d: "M1 3h22v5H1z" },
      { kind: "line", x1: 10, y1: 12, x2: 14, y2: 12 },
    ],
  },
  {
    value: "router",
    label: "路由器 / 软路由",
    shapes: [
      { kind: "path", d: "M5 12h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z" },
      { kind: "circle", cx: 8, cy: 16.5, r: 1 },
      { kind: "line", x1: 12, y1: 16.5, x2: 19, y2: 16.5 },
      { kind: "line", x1: 12, y1: 12, x2: 12, y2: 7 },
      { kind: "path", d: "M8.5 5a5 5 0 0 1 7 0" },
      { kind: "path", d: "M6 2.5a8.5 8.5 0 0 1 12 0" },
    ],
  },
  {
    value: "sliders",
    label: "设置 / 调节",
    shapes: [
      { kind: "line", x1: 4, y1: 21, x2: 4, y2: 14 },
      { kind: "line", x1: 4, y1: 10, x2: 4, y2: 3 },
      { kind: "line", x1: 12, y1: 21, x2: 12, y2: 12 },
      { kind: "line", x1: 12, y1: 8, x2: 12, y2: 3 },
      { kind: "line", x1: 20, y1: 21, x2: 20, y2: 16 },
      { kind: "line", x1: 20, y1: 12, x2: 20, y2: 3 },
      { kind: "line", x1: 1, y1: 14, x2: 7, y2: 14 },
      { kind: "line", x1: 9, y1: 8, x2: 15, y2: 8 },
      { kind: "line", x1: 17, y1: 16, x2: 23, y2: 16 },
    ],
  },
  {
    value: "bell",
    label: "通知 / 消息",
    shapes: [
      { kind: "path", d: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" },
      { kind: "path", d: "M13.73 21a2 2 0 0 1-3.46 0" },
    ],
  },
  {
    value: "bookmark",
    label: "书签 / 归档",
    shapes: [{ kind: "path", d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" }],
  },
  {
    value: "calendar",
    label: "日历 / 日程",
    shapes: [
      { kind: "rect", x: 3, y: 4, w: 18, h: 18, rx: 2 },
      { kind: "line", x1: 16, y1: 2, x2: 16, y2: 6 },
      { kind: "line", x1: 8, y1: 2, x2: 8, y2: 6 },
      { kind: "line", x1: 3, y1: 10, x2: 21, y2: 10 },
    ],
  },
  {
    value: "check-circle",
    label: "通过 / 完成",
    shapes: [
      { kind: "path", d: "M22 11.08V12a10 10 0 1 1-5.93-9.14" },
      { kind: "path", d: "M22 4 12 14.01l-3-3" },
    ],
  },
  {
    value: "clock",
    label: "时间 / 定时",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 10 },
      { kind: "line", x1: 12, y1: 6, x2: 12, y2: 12 },
      { kind: "line", x1: 12, y1: 12, x2: 16, y2: 14 },
    ],
  },
  {
    value: "compass",
    label: "指南 / 探索",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 10 },
      { kind: "path", d: "M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36Z" },
    ],
  },
  {
    value: "credit-card",
    label: "支付 / 订阅",
    shapes: [
      { kind: "rect", x: 1, y: 4, w: 22, h: 16, rx: 2 },
      { kind: "line", x1: 1, y1: 10, x2: 23, y2: 10 },
    ],
  },
  {
    value: "edit",
    label: "编辑 / 撰写",
    shapes: [
      { kind: "path", d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" },
      { kind: "path", d: "M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" },
    ],
  },
  {
    value: "eye",
    label: "浏览 / 预览",
    shapes: [
      { kind: "path", d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" },
      { kind: "circle", cx: 12, cy: 12, r: 3 },
    ],
  },
  {
    value: "file-text",
    label: "文档 / 文件",
    shapes: [
      { kind: "path", d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" },
      { kind: "path", d: "M14 2v6h6" },
      { kind: "line", x1: 16, y1: 13, x2: 8, y2: 13 },
      { kind: "line", x1: 16, y1: 17, x2: 8, y2: 17 },
      { kind: "line", x1: 10, y1: 9, x2: 8, y2: 9 },
    ],
  },
  {
    value: "filter",
    label: "筛选 / 过滤",
    shapes: [{ kind: "path", d: "M22 3H2l8 9.46V19l4 2v-8.54Z" }],
  },
  {
    value: "flame",
    label: "热门 / 火",
    shapes: [
      {
        kind: "path",
        d: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z",
      },
    ],
  },
  {
    value: "gift",
    label: "福利 / 赠送",
    shapes: [
      { kind: "path", d: "M20 12v10H4V12" },
      { kind: "rect", x: 2, y: 7, w: 20, h: 5, rx: 1 },
      { kind: "line", x1: 12, y1: 22, x2: 12, y2: 7 },
      { kind: "path", d: "M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z" },
      { kind: "path", d: "M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z" },
    ],
  },
  {
    value: "hash",
    label: "标签编号 / 锚点",
    shapes: [
      { kind: "line", x1: 4, y1: 9, x2: 20, y2: 9 },
      { kind: "line", x1: 4, y1: 15, x2: 20, y2: 15 },
      { kind: "line", x1: 10, y1: 3, x2: 8, y2: 21 },
      { kind: "line", x1: 16, y1: 3, x2: 14, y2: 21 },
    ],
  },
  {
    value: "headphones",
    label: "音频 / 客服",
    shapes: [
      { kind: "path", d: "M3 18v-6a9 9 0 0 1 18 0v6" },
      {
        kind: "path",
        d: "M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3ZM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3Z",
      },
    ],
  },
  {
    value: "help-circle",
    label: "帮助 / 问答",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 10 },
      { kind: "path", d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" },
      { kind: "line", x1: 12, y1: 17, x2: 12, y2: 17.01 },
    ],
  },
  {
    value: "inbox",
    label: "收件 / 归档箱",
    shapes: [
      { kind: "path", d: "M22 12h-6l-2 3h-4l-2-3H2" },
      {
        kind: "path",
        d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z",
      },
    ],
  },
  {
    value: "layers",
    label: "分层 / 组件",
    shapes: [
      { kind: "path", d: "M12 2 2 7l10 5 10-5Z" },
      { kind: "path", d: "M2 17l10 5 10-5" },
      { kind: "path", d: "M2 12l10 5 10-5" },
    ],
  },
  {
    value: "link",
    label: "链接 / 引用",
    shapes: [
      { kind: "path", d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" },
      { kind: "path", d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" },
    ],
  },
  {
    value: "list",
    label: "列表 / 目录",
    shapes: [
      { kind: "line", x1: 8, y1: 6, x2: 21, y2: 6 },
      { kind: "line", x1: 8, y1: 12, x2: 21, y2: 12 },
      { kind: "line", x1: 8, y1: 18, x2: 21, y2: 18 },
      { kind: "line", x1: 3, y1: 6, x2: 3.01, y2: 6 },
      { kind: "line", x1: 3, y1: 12, x2: 3.01, y2: 12 },
      { kind: "line", x1: 3, y1: 18, x2: 3.01, y2: 18 },
    ],
  },
  {
    value: "mail",
    label: "邮件 / 邮箱",
    shapes: [
      { kind: "path", d: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" },
      { kind: "path", d: "M22 6l-10 7L2 6" },
    ],
  },
  {
    value: "map-pin",
    label: "位置 / 地区",
    shapes: [
      { kind: "path", d: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" },
      { kind: "circle", cx: 12, cy: 10, r: 3 },
    ],
  },
  {
    value: "message-circle",
    label: "评论 / 聊天",
    shapes: [
      {
        kind: "path",
        d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8Z",
      },
    ],
  },
  {
    value: "message-square",
    label: "留言 / 反馈",
    shapes: [{ kind: "path", d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" }],
  },
  {
    value: "moon",
    label: "夜间 / 主题",
    shapes: [{ kind: "path", d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" }],
  },
  {
    value: "newspaper",
    label: "资讯 / 媒体",
    shapes: [
      { kind: "path", d: "M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" },
      { kind: "line", x1: 18, y1: 14, x2: 10, y2: 14 },
      { kind: "line", x1: 15, y1: 18, x2: 15, y2: 18.01 },
      { kind: "line", x1: 18, y1: 18, x2: 18, y2: 18.01 },
    ],
  },
  {
    value: "pie-chart",
    label: "统计 / 报表",
    shapes: [
      { kind: "path", d: "M21.21 15.89A10 10 0 1 1 8 2.83" },
      { kind: "path", d: "M22 12A10 10 0 0 0 12 2v10Z" },
    ],
  },
  {
    value: "bar-chart",
    label: "数据 / 统计",
    shapes: [
      { kind: "line", x1: 12, y1: 20, x2: 12, y2: 10 },
      { kind: "line", x1: 18, y1: 20, x2: 18, y2: 4 },
      { kind: "line", x1: 6, y1: 20, x2: 6, y2: 16 },
    ],
  },
  {
    value: "play",
    label: "播放 / 演示",
    shapes: [{ kind: "path", d: "M5 3l14 9-14 9Z" }],
  },
  {
    value: "plus-circle",
    label: "新增 / 添加",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 10 },
      { kind: "line", x1: 12, y1: 8, x2: 12, y2: 16 },
      { kind: "line", x1: 8, y1: 12, x2: 16, y2: 12 },
    ],
  },
  {
    value: "power",
    label: "电源 / 开关",
    shapes: [
      { kind: "path", d: "M18.36 6.64a9 9 0 1 1-12.73 0" },
      { kind: "line", x1: 12, y1: 2, x2: 12, y2: 12 },
    ],
  },
  {
    value: "refresh-cw",
    label: "刷新 / 更新",
    shapes: [
      { kind: "path", d: "M23 4v6h-6" },
      { kind: "path", d: "M1 20v-6h6" },
      { kind: "path", d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10" },
      { kind: "path", d: "M1 14l4.64 4.36A9 9 0 0 0 20.49 15" },
    ],
  },
  {
    value: "save",
    label: "保存 / 存档",
    shapes: [
      { kind: "path", d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" },
      { kind: "path", d: "M17 21v-8H7v8" },
      { kind: "path", d: "M7 3v5h8" },
    ],
  },
  {
    value: "send",
    label: "发送 / 投稿",
    shapes: [
      { kind: "path", d: "M22 2 11 13" },
      { kind: "path", d: "M22 2 15 22 11 13 2 9Z" },
    ],
  },
  {
    value: "share",
    label: "分享 / 推广",
    shapes: [
      { kind: "circle", cx: 18, cy: 5, r: 3 },
      { kind: "circle", cx: 6, cy: 12, r: 3 },
      { kind: "circle", cx: 18, cy: 19, r: 3 },
      { kind: "line", x1: 8.59, y1: 13.51, x2: 15.42, y2: 17.49 },
      { kind: "line", x1: 15.41, y1: 6.51, x2: 8.59, y2: 10.49 },
    ],
  },
  {
    value: "smile",
    label: "轻松 / 社区",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 10 },
      { kind: "path", d: "M8 14s1.5 2 4 2 4-2 4-2" },
      { kind: "line", x1: 9, y1: 9, x2: 9, y2: 9.01 },
      { kind: "line", x1: 15, y1: 9, x2: 15, y2: 9.01 },
    ],
  },
  {
    value: "sun",
    label: "白天 / 主题",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 5 },
      { kind: "line", x1: 12, y1: 1, x2: 12, y2: 3 },
      { kind: "line", x1: 12, y1: 21, x2: 12, y2: 23 },
      { kind: "line", x1: 4.22, y1: 4.22, x2: 5.64, y2: 5.64 },
      { kind: "line", x1: 18.36, y1: 18.36, x2: 19.78, y2: 19.78 },
      { kind: "line", x1: 1, y1: 12, x2: 3, y2: 12 },
      { kind: "line", x1: 21, y1: 12, x2: 23, y2: 12 },
      { kind: "line", x1: 4.22, y1: 19.78, x2: 5.64, y2: 18.36 },
      { kind: "line", x1: 18.36, y1: 5.64, x2: 19.78, y2: 4.22 },
    ],
  },
  {
    value: "sunrise",
    label: "清晨 / 日出",
    shapes: [
      { kind: "path", d: "M17 18a5 5 0 0 0-10 0" },
      { kind: "line", x1: 12, y1: 2, x2: 12, y2: 9 },
      { kind: "line", x1: 4.22, y1: 10.22, x2: 5.64, y2: 11.64 },
      { kind: "line", x1: 1, y1: 18, x2: 23, y2: 18 },
      { kind: "line", x1: 18.36, y1: 11.64, x2: 19.78, y2: 10.22 },
      { kind: "line", x1: 16, y1: 2, x2: 16, y2: 6 },
      { kind: "line", x1: 8, y1: 2, x2: 8, y2: 6 },
    ],
  },
  {
    value: "tablet",
    label: "平板 / 移动端",
    shapes: [
      { kind: "rect", x: 4, y: 2, w: 16, h: 20, rx: 2 },
      { kind: "line", x1: 12, y1: 18, x2: 12, y2: 18.01 },
    ],
  },
  {
    value: "smartphone",
    label: "手机 / 移动端",
    shapes: [
      { kind: "rect", x: 5, y: 2, w: 14, h: 20, rx: 2 },
      { kind: "line", x1: 12, y1: 18, x2: 12, y2: 18.01 },
    ],
  },
  {
    value: "target",
    label: "目标 / 精准",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 10 },
      { kind: "circle", cx: 12, cy: 12, r: 6 },
      { kind: "circle", cx: 12, cy: 12, r: 2 },
    ],
  },
  {
    value: "thumbs-up",
    label: "点赞 / 推荐",
    shapes: [
      {
        kind: "path",
        d: "M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3ZM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3",
      },
    ],
  },
  {
    value: "trash",
    label: "删除 / 回收站",
    shapes: [
      { kind: "path", d: "M3 6h18" },
      { kind: "path", d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" },
      { kind: "line", x1: 10, y1: 11, x2: 10, y2: 17 },
      { kind: "line", x1: 14, y1: 11, x2: 14, y2: 17 },
    ],
  },
  {
    value: "trophy",
    label: "奖项 / 精选",
    shapes: [
      { kind: "path", d: "M6 9H4.5a2.5 2.5 0 0 1 0-5H6" },
      { kind: "path", d: "M18 9h1.5a2.5 2.5 0 0 0 0-5H18" },
      { kind: "path", d: "M4 22h16" },
      { kind: "path", d: "M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" },
      { kind: "path", d: "M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" },
      { kind: "path", d: "M18 2H6v7a6 6 0 0 0 12 0Z" },
    ],
  },
  {
    value: "award",
    label: "认证 / 勋章",
    shapes: [
      { kind: "circle", cx: 12, cy: 8, r: 7 },
      { kind: "path", d: "M8.21 13.89 7 23l5-3 5 3-1.21-9.12" },
    ],
  },
  {
    value: "upload-cloud",
    label: "上传 / 云同步",
    shapes: [
      { kind: "path", d: "M16 16l-4-4-4 4" },
      { kind: "line", x1: 12, y1: 12, x2: 12, y2: 21 },
      { kind: "path", d: "M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" },
      { kind: "path", d: "M16 16l-4-4-4 4" },
    ],
  },
  {
    value: "umbrella",
    label: "保护 / 保障",
    shapes: [
      { kind: "path", d: "M23 12a11.05 11.05 0 0 0-22 0Z" },
      { kind: "path", d: "M18 12v7a3 3 0 0 1-6 0v-7" },
    ],
  },
  {
    value: "volume",
    label: "音频 / 音量",
    shapes: [
      { kind: "path", d: "M11 5 6 9H2v6h4l5 4Z" },
      { kind: "path", d: "M19.07 4.93a10 10 0 0 1 0 14.14" },
      { kind: "path", d: "M15.54 8.46a5 5 0 0 1 0 7.07" },
    ],
  },
  {
    value: "watch",
    label: "监控 / 手表",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 7 },
      { kind: "path", d: "M12 9v3l2 2" },
      { kind: "path", d: "M16.51 17.35 16.16 21a2 2 0 0 1-2 1.82H9.83A2 2 0 0 1 7.83 21l-.35-3.65" },
      { kind: "path", d: "M7.52 6.65 7.17 3A2 2 0 0 1 9.17 1h4.66a2 2 0 0 1 2 1.83l-.35 3.65" },
    ],
  },
  {
    value: "external-link",
    label: "外链 / 访问",
    shapes: [
      { kind: "path", d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" },
      { kind: "path", d: "M15 3h6v6" },
      { kind: "line", x1: 10, y1: 14, x2: 21, y2: 3 },
    ],
  },
  {
    value: "alert-circle",
    label: "提示 / 注意",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 10 },
      { kind: "line", x1: 12, y1: 8, x2: 12, y2: 12 },
      { kind: "line", x1: 12, y1: 16, x2: 12, y2: 16.01 },
    ],
  },
  {
    value: "alert-triangle",
    label: "警告 / 风险",
    shapes: [
      { kind: "path", d: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" },
      { kind: "line", x1: 12, y1: 9, x2: 12, y2: 13 },
      { kind: "line", x1: 12, y1: 17, x2: 12, y2: 17.01 },
    ],
  },
  {
    value: "x-circle",
    label: "关闭 / 取消",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 10 },
      { kind: "line", x1: 15, y1: 9, x2: 9, y2: 15 },
      { kind: "line", x1: 9, y1: 9, x2: 15, y2: 15 },
    ],
  },
  {
    value: "check",
    label: "勾选 / 完成",
    shapes: [{ kind: "path", d: "M20 6 9 17l-5-5" }],
  },
  {
    value: "plus",
    label: "添加 / 新增",
    shapes: [
      { kind: "line", x1: 12, y1: 5, x2: 12, y2: 19 },
      { kind: "line", x1: 5, y1: 12, x2: 19, y2: 12 },
    ],
  },
  {
    value: "arrow-up",
    label: "向上 / 置顶",
    shapes: [
      { kind: "line", x1: 12, y1: 19, x2: 12, y2: 5 },
      { kind: "path", d: "M5 12l7-7 7 7" },
    ],
  },
  {
    value: "arrow-right",
    label: "前往 / 直达",
    shapes: [
      { kind: "line", x1: 5, y1: 12, x2: 19, y2: 12 },
      { kind: "path", d: "M12 5l7 7-7 7" },
    ],
  },
  {
    value: "book-open",
    label: "阅读 / 教程",
    shapes: [
      { kind: "path", d: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z" },
      { kind: "path", d: "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z" },
    ],
  },
  {
    value: "clipboard",
    label: "表单 / 收集",
    shapes: [
      { kind: "path", d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" },
      { kind: "rect", x: 8, y: 2, w: 8, h: 4, rx: 1 },
    ],
  },
  {
    value: "copy",
    label: "复制 / 副本",
    shapes: [
      { kind: "rect", x: 9, y: 9, w: 13, h: 13, rx: 2 },
      { kind: "path", d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" },
    ],
  },
  {
    value: "feather",
    label: "轻量 / 羽化",
    shapes: [
      { kind: "path", d: "M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5Z" },
      { kind: "line", x1: 16, y1: 8, x2: 2, y2: 22 },
      { kind: "line", x1: 17.5, y1: 15, x2: 9, y2: 15 },
    ],
  },
  {
    value: "git-commit",
    label: "提交 / 版本",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 4 },
      { kind: "line", x1: 1.05, y1: 12, x2: 7, y2: 12 },
      { kind: "line", x1: 17, y1: 12, x2: 22.94, y2: 12 },
    ],
  },
  {
    value: "git-merge",
    label: "合并 / 分支",
    shapes: [
      { kind: "circle", cx: 18, cy: 18, r: 3 },
      { kind: "circle", cx: 6, cy: 6, r: 3 },
      { kind: "path", d: "M6 21V9a9 9 0 0 0 9 9" },
    ],
  },
  {
    value: "git-pull-request",
    label: "请求 / 协作",
    shapes: [
      { kind: "circle", cx: 18, cy: 18, r: 3 },
      { kind: "circle", cx: 6, cy: 6, r: 3 },
      { kind: "path", d: "M13 6h3a2 2 0 0 1 2 2v7" },
      { kind: "line", x1: 6, y1: 9, x2: 6, y2: 21 },
    ],
  },
  {
    value: "life-buoy",
    label: "救援 / 帮助",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 10 },
      { kind: "circle", cx: 12, cy: 12, r: 4 },
      { kind: "line", x1: 4.93, y1: 4.93, x2: 9.17, y2: 9.17 },
      { kind: "line", x1: 14.83, y1: 14.83, x2: 19.07, y2: 19.07 },
      { kind: "line", x1: 14.83, y1: 9.17, x2: 19.07, y2: 4.93 },
      { kind: "line", x1: 9.17, y1: 14.83, x2: 4.93, y2: 19.07 },
    ],
  },
  {
    value: "log-in",
    label: "登录 / 进入",
    shapes: [
      { kind: "path", d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" },
      { kind: "path", d: "M10 17l5-5-5-5" },
      { kind: "line", x1: 15, y1: 12, x2: 3, y2: 12 },
    ],
  },
  {
    value: "log-out",
    label: "退出 / 离开",
    shapes: [
      { kind: "path", d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" },
      { kind: "path", d: "M16 17l5-5-5-5" },
      { kind: "line", x1: 21, y1: 12, x2: 9, y2: 12 },
    ],
  },
  {
    value: "map",
    label: "地图 / 地区",
    shapes: [{ kind: "path", d: "M1 6v16l7-4 8 4 7-4V2l-7 4-8-4Z" }],
  },
  {
    value: "mic",
    label: "录音 / 麦克风",
    shapes: [
      { kind: "path", d: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" },
      { kind: "path", d: "M19 10v2a7 7 0 0 1-14 0v-2" },
      { kind: "line", x1: 12, y1: 19, x2: 12, y2: 23 },
      { kind: "line", x1: 8, y1: 23, x2: 16, y2: 23 },
    ],
  },
  {
    value: "percent",
    label: "折扣 / 优惠",
    shapes: [
      { kind: "line", x1: 19, y1: 5, x2: 5, y2: 19 },
      { kind: "circle", cx: 6.5, cy: 6.5, r: 2.5 },
      { kind: "circle", cx: 17.5, cy: 17.5, r: 2.5 },
    ],
  },
  {
    value: "repeat",
    label: "循环 / 重复",
    shapes: [
      { kind: "path", d: "M17 1l4 4-4 4" },
      { kind: "path", d: "M3 11V9a4 4 0 0 1 4-4h14" },
      { kind: "path", d: "M7 23l-4-4 4-4" },
      { kind: "path", d: "M21 13v2a4 4 0 0 1-4 4H3" },
    ],
  },
  {
    value: "rss",
    label: "订阅 / RSS",
    shapes: [
      { kind: "path", d: "M4 11a9 9 0 0 1 9 9" },
      { kind: "path", d: "M4 4a16 16 0 0 1 16 16" },
      { kind: "circle", cx: 5, cy: 19, r: 1 },
    ],
  },
  {
    value: "scissors",
    label: "剪辑 / 压缩",
    shapes: [
      { kind: "circle", cx: 6, cy: 6, r: 3 },
      { kind: "circle", cx: 6, cy: 18, r: 3 },
      { kind: "line", x1: 20, y1: 4, x2: 8.12, y2: 15.88 },
      { kind: "line", x1: 14.47, y1: 14.48, x2: 20, y2: 20 },
      { kind: "line", x1: 8.12, y1: 8.12, x2: 12, y2: 12 },
    ],
  },
  {
    value: "shopping-bag",
    label: "购物 / 网购",
    shapes: [
      { kind: "path", d: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" },
      { kind: "line", x1: 3, y1: 6, x2: 21, y2: 6 },
      { kind: "path", d: "M16 10a4 4 0 0 1-8 0" },
    ],
  },
  {
    value: "tv",
    label: "影音 / 电视",
    shapes: [
      { kind: "rect", x: 2, y: 7, w: 20, h: 15, rx: 2 },
      { kind: "path", d: "M17 2l-5 5-5-5" },
    ],
  },
  {
    value: "type",
    label: "字体 / 排版",
    shapes: [
      { kind: "path", d: "M4 7V4h16v3" },
      { kind: "line", x1: 9, y1: 20, x2: 15, y2: 20 },
      { kind: "line", x1: 12, y1: 4, x2: 12, y2: 20 },
    ],
  },
  {
    value: "unlock",
    label: "解锁 / 开放",
    shapes: [
      { kind: "rect", x: 3, y: 11, w: 18, h: 11, rx: 2 },
      { kind: "path", d: "M7 11V7a5 5 0 0 1 9.9-1" },
    ],
  },
  {
    value: "user-check",
    label: "认证用户",
    shapes: [
      { kind: "path", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" },
      { kind: "circle", cx: 9, cy: 7, r: 4 },
      { kind: "path", d: "M17 11l2 2 4-4" },
    ],
  },
  {
    value: "user-plus",
    label: "新增用户",
    shapes: [
      { kind: "path", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" },
      { kind: "circle", cx: 9, cy: 7, r: 4 },
      { kind: "line", x1: 20, y1: 8, x2: 20, y2: 14 },
      { kind: "line", x1: 23, y1: 11, x2: 17, y2: 11 },
    ],
  },
  {
    value: "zoom-in",
    label: "放大 / 查找",
    shapes: [
      { kind: "circle", cx: 11, cy: 11, r: 8 },
      { kind: "line", x1: 21, y1: 21, x2: 16.65, y2: 16.65 },
      { kind: "line", x1: 11, y1: 8, x2: 11, y2: 14 },
      { kind: "line", x1: 8, y1: 11, x2: 14, y2: 11 },
    ],
  },
  {
    value: "anchor",
    label: "锚点 / 固定",
    shapes: [
      { kind: "circle", cx: 12, cy: 5, r: 3 },
      { kind: "line", x1: 12, y1: 22, x2: 12, y2: 8 },
      { kind: "path", d: "M5 12H2a10 10 0 0 0 20 0h-3" },
    ],
  },
  {
    value: "flag",
    label: "推荐 / 标记",
    shapes: [
      { kind: "path", d: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z" },
      { kind: "line", x1: 4, y1: 22, x2: 4, y2: 15 },
    ],
  },
];

export const CATEGORY_ICON_MAP: Record<string, CategoryIconDef> = Object.fromEntries(
  CATEGORY_ICONS.map((i) => [i.value, i])
);

/** 是否是内置图标名 */
export function isBuiltinIcon(icon: string): boolean {
  return Object.prototype.hasOwnProperty.call(CATEGORY_ICON_MAP, icon);
}

/**
 * 是否是图片地址。
 *
 * 站内相对路径（/uploads/xx.png）也算图片；
 * 图标字体类名由 isIconFont 先行判定，两者不冲突。
 */
export function isImageIcon(icon: string): boolean {
  const v = (icon ?? "").trim();
  if (!v) return false;
  return /^(https?:)?\/\//i.test(v) || v.startsWith("/") || v.startsWith("data:");
}

/** iconfont 识别线索：样式表里解析出来的图标类名与基础类名 */
export interface IconFontHints {
  /** 样式表里的图标类名，如 io-wangzhan */
  glyphs?: Set<string> | readonly string[];
  /** 样式表里的基础类名，如 io */
  baseClass?: string;
}

/** 去掉前导的 / 与 ./，"/io-xxx" 这种写法按类名处理 */
function normalizeIconValue(icon: string): string {
  return (icon ?? "").trim().replace(/^\.\//, "").replace(/^\//, "");
}

/**
 * 是否是 iconfont 图标。
 *
 * 支持后台能填进去的各种写法：
 *   - "iconfont:xxx"              → 显式前缀
 *   - "icon-xxx" / "icon_xxx"     → 单个类名
 *   - "iconfont icon-xxx"         → iconfont 官网给的标准片段
 *   - ".icon-xxx"                 → 带点的类名
 *   - "io-wangzhan"               → 样式表里真实存在的图标类名（按 hints 判定）
 *
 * 判断规则：所有 token 都得是合法 CSS 类名，且满足下面任一条：
 *   1. 显式 iconfont: 前缀；
 *   2. 命中样式表解析出来的图标类名 / 基础类名前缀；
 *   3. 类名里含 icon 词（el-icon-xxx 这类第三方命名）。
 * 否则按普通文字（Emoji / 中文）渲染。
 */
export function isIconFont(icon: string, hints?: IconFontHints): boolean {
  const v = normalizeIconValue(icon);
  if (!v) return false;

  if (v.startsWith("iconfont:")) return v.slice(9).trim().length > 0;

  const tokens = v.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  const isClass = (t: string) => /^\.?[A-Za-z_][\w-]*$/.test(t);
  if (!tokens.every(isClass)) return false;

  const names = tokens.map((t) => t.replace(/^\./, ""));

  const glyphs = hints?.glyphs;
  if (glyphs) {
    const has = (n: string) =>
      glyphs instanceof Set ? glyphs.has(n) : glyphs.includes(n);
    if (names.some(has)) return true;
    const base = hints?.baseClass;
    if (base && names.some((n) => n.startsWith(`${base}-`))) return true;
  }

  return names.some((n) => /(^|[-_])icon([-_]|$)/i.test(n));
}

/**
 * iconfont 值 → class 名列表（去掉 iconfont 基础类与前导点）。
 * 返回空数组表示不是 iconfont。
 */
export function iconFontClasses(icon: string): string[] {
  const v = normalizeIconValue(icon);
  if (!v) return [];

  const raw = v.startsWith("iconfont:") ? v.slice(9).trim() : v;
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.replace(/^\./, "").trim())
    .filter(Boolean);

  const out = tokens.filter((t) => t !== "iconfont");
  return out.length > 0 ? out : tokens;
}
