"use client";

import { Star } from "lucide-react";
import type { MouseEvent } from "react";
import { useIsWatched, useWatchlistStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Звёздочка «в избранное». Живёт внутри карточки, которая целиком является
 * ссылкой, поэтому клик обязан гаситься — иначе уйдём на страницу события.
 * До гидратации стора `useIsWatched` возвращает false, разметка совпадает с SSR.
 */
export function WatchlistButton({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const watched = useIsWatched(slug);
  const toggle = useWatchlistStore((state) => state.toggle);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggle(slug);
  };

  const label = watched ? "Убрать из избранного" : "Добавить в избранное";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={watched}
      aria-label={label}
      title={label}
      className={cn(
        "relative z-10 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md",
        "transition-colors hover:bg-surface-hover",
        watched ? "text-warn" : "text-faint hover:text-text",
        className,
      )}
    >
      <Star className={cn("size-3.5", watched && "fill-current")} />
    </button>
  );
}
