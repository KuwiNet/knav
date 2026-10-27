import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { getCategories } from "@/lib/content";
import { getWallpaperView } from "@/lib/wallpaper";
import { getSiteConfig, parseVerificationMeta } from "@/lib/site-config";
import { getIconFontInfo } from "@/lib/iconfont";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteNotice } from "@/components/site-notice";
import FloatingActions from "@/components/floating-actions";
import WallpaperLayer from "@/components/wallpaper-layer";
import { IconFontProvider } from "@/components/iconfont-provider";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig();
  const description = cfg.seoDescription || cfg.siteDescription;

  return {
    title: {
      default: cfg.siteName,
      template: cfg.seoTitle || "%s",
    },
    description,
    keywords: cfg.seoKeywords || cfg.siteKeywords || undefined,
    applicationName: cfg.siteName,
    icons: {
      icon: cfg.faviconUrl || undefined,
      shortcut: cfg.faviconUrl || undefined,
      apple: cfg.faviconUrl || undefined,
    },
    openGraph: {
      title: cfg.siteName,
      description,
      url: cfg.siteUrl || undefined,
      siteName: cfg.siteName,
      type: "website",
      images: cfg.seoOgImage ? [cfg.seoOgImage] : undefined,
    },
    robots: cfg.seoNoindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    other: parseVerificationMeta(cfg.seoVerification),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cfg = await getSiteConfig();
  const [user, categories, { wallpaper, mask }, iconFont] = await Promise.all([
    getCurrentUser(),
    getCategories(),
    getWallpaperView(),
    getIconFontInfo(cfg.iconfontCss),
  ]);

  const useWallpaper = cfg.showWallpaper && !!wallpaper;

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {cfg.iconfontCss ? (
          <link rel="stylesheet" href={cfg.iconfontCss} />
        ) : null}
        {/* 图标字体：外部样式表只带图标类名，字体名要在这里补上，否则图标是空的 */}
        {iconFont?.injectCss ? (
          <style dangerouslySetInnerHTML={{ __html: iconFont.injectCss }} />
        ) : null}
        {/* 主题要在首屏渲染前定下来，否则会先闪一下浅色再切深色 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("knav-theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",s==="dark"||s==="light"?s:d);}catch(e){}})();`,
          }}
        />
        {/* 后台「统计与代码」里配置的自定义代码，插入到页面头部 */}
        {cfg.headCode ? (
          <script dangerouslySetInnerHTML={{ __html: cfg.headCode }} />
        ) : null}
        {cfg.analyticsCode ? (
          <script dangerouslySetInnerHTML={{ __html: cfg.analyticsCode }} />
        ) : null}
      </head>
      <body>
        <IconFontProvider
          value={{
            fontFamily: iconFont?.fontFamily ?? "",
            baseClass: iconFont?.baseClass ?? "",
            glyphs: iconFont?.glyphs ?? [],
          }}
        >
          {useWallpaper ? (
            <>
              <WallpaperLayer wallpaper={wallpaper} />
              <div className={`wall-mask wall-mask-${mask}`} aria-hidden="true" />
            </>
          ) : null}

          <SiteHeader user={user} categories={categories} cfg={cfg} />

          <SiteNotice cfg={cfg} position="top" />

          {!cfg.siteOpen ? (
            <div className="site-closed">
              <div className="card card-pad">
                <h1 className="detail-title">站点维护中</h1>
                <p className="text-muted">
                  站点正在维护升级，暂时关闭对外服务，请稍后再来。
                </p>
              </div>
            </div>
          ) : (
            <main className="container" style={{ paddingTop: 26, paddingBottom: 10 }}>
              {children}
            </main>
          )}

          <SiteNotice cfg={cfg} position="bottom" />

          <SiteFooter cfg={cfg} />

          <FloatingActions />
        </IconFontProvider>

        {cfg.bodyCode ? (
          <script dangerouslySetInnerHTML={{ __html: cfg.bodyCode }} />
        ) : null}
      </body>
    </html>
  );
}
