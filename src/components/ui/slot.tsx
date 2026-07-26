"use client";

import { Children, cloneElement, isValidElement, type ReactElement } from "react";
import { cn } from "@/lib/utils";

/**
 * Минимальный аналог Radix Slot: переносит className и пропсы на единственного
 * ребёнка. Нужен для `asChild` у Button — чтобы ссылка выглядела как кнопка,
 * не порождая вложенность <a><button>.
 */
export function Slot({
  children,
  className,
  ...props
}: {
  children?: React.ReactNode;
  className?: string;
} & Record<string, unknown>) {
  const child = Children.only(children) as ReactElement<{ className?: string }>;
  if (!isValidElement(child)) return null;

  return cloneElement(child, {
    ...props,
    className: cn(className, child.props.className),
  } as Partial<{ className?: string }>);
}
