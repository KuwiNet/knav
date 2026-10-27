import { notFound } from "next/navigation";
import { getContentItem, parseContentId } from "@/lib/content";
import ArticleDetailPage from "@/components/detail/article-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = parseContentId(rawId);
  if (!id) notFound();
  const item = await getContentItem(id);
  return { title: item ? item.title : "内容不存在" };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return ArticleDetailPage({ params });
}
