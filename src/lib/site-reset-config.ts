/**
 * 站点重置的可清空范围（纯数据，客户端安全）。
 * 服务端 lib/site-reset.ts 按这些 key 决定删哪些表。
 */

export interface ResetScope {
  key: string;
  label: string;
  hint: string;
}

export const RESET_SCOPES: ResetScope[] = [
  {
    key: "content",
    label: "内容",
    hint: "网址、文章、软件条目，连同备用链接、标签关联与收藏记录",
  },
  {
    key: "taxonomy",
    label: "分类与标签",
    hint: "全部分类与标签；内容的分类会归零，建议和「内容」一起清空",
  },
  {
    key: "submissions",
    label: "投稿",
    hint: "所有投稿记录（含待审核与已处理）",
  },
  {
    key: "downloads",
    label: "下载",
    hint: "所有软件的平台版本与镜像链接",
  },
  {
    key: "media",
    label: "素材（含上传文件）",
    hint: "素材库记录并删除 public/uploads 下的实际文件；已有内容的本地图片会失效",
  },
  {
    key: "users",
    label: "用户（保留站长）",
    hint: "删除除站长外的账号，连同其会话、收藏、通知与投稿",
  },
  {
    key: "messages",
    label: "通知与邮件日志",
    hint: "站内通知与邮件发送记录",
  },
  {
    key: "logs",
    label: "操作日志",
    hint: "后台操作日志与数据迁移任务记录",
  },
  {
    key: "settings",
    label: "站点设置",
    hint: "恢复默认配置：站点名称、外观、SEO、SMTP、登录方式等都会丢",
  },
];

export const RESET_SCOPE_KEYS = RESET_SCOPES.map((s) => s.key);
