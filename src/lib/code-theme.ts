import { cookies } from "next/headers";
import { CODE_THEME_BY_MODE } from "./settings-config";
import { getCodeConfig } from "./settings";

/**
 * 详情页代码块容器的主题 class。
 *
 * 后台「代码块主题」只是站点默认值：访客没手动选过深浅（跟随系统或后台固定值）时按它渲染。
 * 一旦用右下角按钮明确切到某个模式，代码块就跟着模式走，见 CODE_THEME_BY_MODE。
 * 访客的手动选择由 floating-actions 与 layout 的内联脚本同步进 cookie，服务端才能在同一次渲染里读到。
 */

/** 与前端 localStorage 同名的键，值只有 dark / light 两种 */
const THEME_COOKIE = "knav-theme";

export async function codeThemeClasses(): Promise<string> {
  const cfg = await getCodeConfig();
  const manual = (await cookies()).get(THEME_COOKIE)?.value;
  const theme =
    manual === "dark" || manual === "light"
      ? CODE_THEME_BY_MODE[manual]
      : cfg.theme;
  return `code-theme-${theme} code-inline-${cfg.inlineStyle}`;
}
