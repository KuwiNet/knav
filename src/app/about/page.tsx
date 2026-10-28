import Link from "next/link";
import { getSiteConfig } from "@/lib/site-config";
import { enhanceImages, renderMarkdownSync } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const cfg = await getSiteConfig();

  return (
    <div className="container">
      <div className="detail" style={{ maxWidth: 820 }}>
        <h1 className="detail-title">关于本站</h1>

        <div
          className="article-body"
          dangerouslySetInnerHTML={{
            __html: enhanceImages(renderMarkdownSync(cfg.aboutContent), "关于本站配图"),
          }}
        />

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
