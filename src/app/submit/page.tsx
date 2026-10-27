import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCategories, getTags } from "@/lib/content";
import SubmitForm from "@/components/submit-form";

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/submit");
  if (!user.emailVerified) redirect("/verify-email");

  const categories = await getCategories();
  const tags = await getTags(50);

  return (
    <div className="container">
      <div className="page-title">投稿</div>
      <p className="page-sub">
        分享一个好用的网址，或写一篇 Markdown 文章。所有投稿都需要审核，通过后自动发布。
      </p>
      <div style={{ maxWidth: 860 }}>
        <SubmitForm categories={categories} tagNames={tags.map((t) => t.name)} />
      </div>
    </div>
  );
}
