import Link from "next/link";
import type { SiteConfig } from "@/lib/site-config";

/** 解析页脚额外链接：每行「名称|地址」 */
function parseFooterLinks(raw: string): { name: string; url: string }[] {
  return (raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf("|");
      if (idx < 0) return { name: line, url: "" };
      return {
        name: line.slice(0, idx).trim(),
        url: line.slice(idx + 1).trim(),
      };
    })
    .filter((l) => l.name);
}

export function SiteFooter({ cfg }: { cfg: SiteConfig }) {
  const links = parseFooterLinks(cfg.footerLinks);
  const copyright = cfg.footerCopyright || cfg.siteName;

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-line">
          Copyright © {new Date().getFullYear()} {copyright}
          {" · "}
          <span>
            Powered by{" "}
            <a
              href="https://github.com/KuwiNet/knav"
              target="_blank"
              rel="noopener noreferrer"
            >
              knav
            </a>
          </span>
          {" · "}
          <Link href="/about">关于本站</Link>
          {" · "}
          <Link href="/contribute">投稿须知</Link>
          {links.map((l) => (
            <span key={`${l.name}-${l.url}`}>
              {" · "}
              {l.url ? (
                l.url.startsWith("/") ? (
                  <Link href={l.url}>{l.name}</Link>
                ) : (
                  <a href={l.url} target="_blank" rel="noopener noreferrer nofollow">
                    {l.name}
                  </a>
                )
              ) : (
                l.name
              )}
            </span>
          ))}
          {cfg.icp ? (
            <span>
              {" · "}
              <a
                href={cfg.footerIcpLink || "https://beian.miit.gov.cn/"}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                {cfg.icp}
              </a>
            </span>
          ) : null}
        </div>
        {cfg.footerNote ? (
          <div className="footer-line">{cfg.footerNote}</div>
        ) : null}
      </div>
    </footer>
  );
}
