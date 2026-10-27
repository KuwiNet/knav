import Link from "next/link";

export const dynamic = "force-dynamic";

export default function ContributePage() {
  return (
    <div className="container">
      <div className="detail" style={{ maxWidth: 820 }}>
        <h1 className="detail-title">投稿须知</h1>

        <div className="article-body">
          <h2>一、账号</h2>
          <ul>
            <li>点击右上角「注册」创建账号，填写用户名、邮箱与密码。</li>
            <li>注册后系统会发送验证邮件，24 小时内点击链接完成验证才能登录。</li>
            <li>投稿、收藏、接收审核通知都依赖验证后的邮箱，请确保邮箱可用。</li>
          </ul>

          <h2>二、投稿类型</h2>
          <ul>
            <li>
              <strong>网址收藏</strong>：填写名称、网址、简介与图标地址，
              提交后会在对应分类中以卡片形式展示，点击可直接跳转。
            </li>
            <li>
              <strong>文章</strong>：使用 Markdown 书写正文，支持标题、列表、表格、
              代码块、引用、链接与图片，提交前有实时预览。
            </li>
          </ul>

          <h2>三、分类与标签</h2>
          <p>
            网址与文章使用同一套分类，选择最贴切的分类即可；
            标签用英文逗号分隔，例如 <code>VPS, 教程, 开源</code>，最多 10 个。
            标签会在审核通过时自动创建或复用。
          </p>

          <h2>四、审核</h2>
          <ul>
            <li>投稿提交后进入待审核状态，可在「个人中心 → 我的投稿」中查看进度。</li>
            <li>待审核期间可以自行撤回。</li>
            <li>审核结果会通过站内通知和邮件同时通知你，通过的内容会自动发布。</li>
            <li>若未通过，请根据审核意见调整后重新投稿。</li>
          </ul>

          <h2>五、内容要求</h2>
          <ul>
            <li>只收录长期可用、无违规内容的资源。</li>
            <li>简介请用一到两句话说明用途，便于他人判断是否需要。</li>
            <li>不要提交与已有内容重复的条目。</li>
            <li>涉及版权、隐私的内容请自行确认已获授权。</li>
          </ul>
        </div>

        <div className="divider" />
        <Link href="/submit" className="btn">
          开始投稿
        </Link>
      </div>
    </div>
  );
}
