/**
 * 全站统一的头像渲染：有地址显示图片，没地址显示名字首字母。
 * 后台用户列表、账号设置、投稿署名都用它，避免各处自己写一套圆形图片。
 */
export default function Avatar({
  src,
  name,
  size = 32,
  className = "",
}: {
  src?: string | null;
  /** 名字（用户名或昵称），决定首字母 */
  name: string;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.44) };
  const url = (src ?? "").trim();

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        title={name}
        width={size}
        height={size}
        loading="lazy"
        className={`avatar ${className}`.trim()}
        style={style}
      />
    );
  }

  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={`avatar avatar-initial ${className}`.trim()} style={style} aria-hidden>
      {initial}
    </span>
  );
}
