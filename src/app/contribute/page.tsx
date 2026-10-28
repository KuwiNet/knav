import Link from "next/link";
import { getSiteConfig } from "@/lib/site-config";
import { enhanceImages, renderMarkdownSync } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export default async function ContributePage() {
  const cfg = await getSiteConfig();

  return (
    <div className="container">
      <div className="detail" style={{ maxWidth: 820 }}>
        <h1 className="detail-title">投稿须知</h1>

        <div
          className="article-body"
          dangerouslySetInnerHTML={{
            __html: enhanceImages(renderMarkdownSync(cfg.contributeContent), "投稿须知配图"),
          }}
        />

        <div className="divider" />
        <Link href="/submit" className="btn">
          开始投稿
        </Link>
      </div>
    </div>
  );
}
