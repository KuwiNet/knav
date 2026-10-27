import Link from "next/link";
import { getCategories } from "@/lib/content";
import CategoryIcon from "@/components/category-icon";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "全部分类",
  description: "本站全部导航分类，二级分类归在所属顶级分类下。",
};

/**
 * 全部分类页。
 *
 * 二级分类不与顶级分类平级铺开：一律收在所属顶级分类里，
 * 点顶级分类才展开（用 details/summary，不额外写脚本）。
 */
export default async function CategoryIndexPage() {
  const cats = await getCategories();
  const tops = cats.filter((c) => c.parent === 0);

  const childrenOf = new Map<number, typeof cats>();
  for (const c of cats) {
    if (!c.parent) continue;
    const list = childrenOf.get(c.parent) ?? [];
    list.push(c);
    childrenOf.set(c.parent, list);
  }

  return (
    <div className="container">
      <h1 className="page-title">全部分类</h1>
      <p className="page-sub">
        共 {tops.length} 个顶级分类、{cats.length - tops.length} 个二级分类
      </p>

      <div className="stack" style={{ gap: 12 }}>
        {tops.map((c) => {
          const kids = childrenOf.get(c.id) ?? [];
          return (
            <section key={c.id} className="card card-pad">
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <CategoryIcon icon={c.icon} name={c.name} size={18} />
                <Link href={`/category/${c.slug}`} className="strong" style={{ fontSize: 16 }}>
                  {c.name}
                </Link>
                <span className="badge">{c.count}</span>
                {c.description ? (
                  <span className="text-muted text-sm">{c.description}</span>
                ) : null}
              </div>

              {kids.length > 0 ? (
                <details style={{ marginTop: 10 }}>
                  <summary className="text-sm text-muted" style={{ cursor: "pointer" }}>
                    展开 {kids.length} 个二级分类
                  </summary>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {kids.map((k) => (
                      <Link
                        key={k.id}
                        href={`/category/${k.slug}`}
                        className="badge badge-accent"
                      >
                        <CategoryIcon icon={k.icon} name={k.name} size={13} />
                        <span>
                          {k.name} ({k.count})
                        </span>
                      </Link>
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
