"use client";

/**
 * 带二次确认的提交按钮。
 * 服务端组件里不能直接写 onClick，所以统一用这个客户端组件包一层。
 */
export default function ConfirmButton({
  message,
  className,
  style,
  children,
  title,
}: {
  message: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      style={style}
      title={title}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
