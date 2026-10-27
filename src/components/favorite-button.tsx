"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleFavoriteAction } from "@/lib/actions/favorite-actions";

/**
 * 卡片上的收藏按钮。
 *
 * 放在卡片右上角，点击不触发卡片链接跳转。
 * 未登录时点击跳到登录页。
 */
export default function FavoriteButton({
  contentId,
  initial = false,
  loggedIn = true,
}: {
  contentId: number;
  initial?: boolean;
  loggedIn?: boolean;
}) {
  const [favorited, setFavorited] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent(
        typeof window !== "undefined" ? window.location.pathname : "/"
      )}`);
      return;
    }
    startTransition(async () => {
      const res = await toggleFavoriteAction(contentId);
      if (res.ok && typeof res.favorited === "boolean") {
        setFavorited(res.favorited);
      }
    });
  };

  return (
    <button
      type="button"
      className={`fav-btn${favorited ? " is-on" : ""}`}
      onClick={onClick}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={favorited ? "取消收藏" : "加入收藏"}
      title={favorited ? "取消收藏" : "加入收藏"}
    >
      {favorited ? "★" : "☆"}
    </button>
  );
}
