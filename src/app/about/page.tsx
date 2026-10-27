import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AboutPage() {
  return (
    <div className="container">
      <div className="detail" style={{ maxWidth: 820 }}>
        <h1 className="detail-title">关于本站</h1>

        <div className="article-body">
          <p>
            knav 是一个为了方便上网更快捷的一键直达而建立的网址收藏网站，
            网站完全是非盈利性质，全部内容均来自网络和网友投稿。
          </p>

          <h2>内容组织</h2>
          <p>
            站点使用一套统一的分类体系，<strong>网址收藏</strong>与<strong>文章</strong>
            共用同一批分类。在同一个分类页里，两种内容会以完全一致的卡片样式混排展示，
            方便在一个主题下同时找到「直达入口」和「深度说明」。
          </p>

          <h2>投稿与审核</h2>
          <ul>
            <li>注册后需要通过邮箱验证，才能登录并投稿。</li>
            <li>文章支持 Markdown 语法，提交前可在页面上实时预览。</li>
            <li>所有投稿都会进入审核队列，审核结果通过站内通知与邮件同时告知。</li>
            <li>审核通过的内容会自动发布到对应分类，并显示作者提交的标签。</li>
          </ul>

          <h2>免责声明</h2>
          <p>
            站内内容全部来自网络分享与网友投稿，本站仅收录优质资源，
            不保证外部链接的准确性与完整性，也不为第三方站点承担任何责任。
            如侵犯到您的权利，请联系反馈邮箱，我们会尽快删除相应内容。
          </p>
        </div>

        <div className="divider" />
        <div className="row" style={{ gap: 10 }}>
          <Link href="/submit" className="btn">
            我要投稿
          </Link>
          <Link href="/contribute" className="btn btn-outline">
            投稿须知
          </Link>
        </div>
      </div>
    </div>
  );
}
