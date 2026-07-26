import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Единая горизонтальная сетка приложения. Все страницы и элементы шапки
 * оборачиваются в неё — иначе колонки контента и навигации разъезжаются.
 */
export const CONTAINER = "mx-auto w-full max-w-[1440px] px-4 sm:px-6";

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(CONTAINER, className)}>{children}</div>;
}
