"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { imageSrc, FALLBACK_IMAGE } from "@/lib/utils";

/**
 * Иконка рынка/события. Обычный <img>, а не next/image: источники приходят
 * с нескольких CDN Polymarket и иногда битые — здесь важнее устойчивость,
 * чем оптимизация. Битая ссылка молча заменяется заглушкой.
 */
export function MarketImage({
  src,
  alt,
  className,
  size = 40,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <img
      src={failed ? FALLBACK_IMAGE : imageSrc(src)}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn(
        "shrink-0 rounded-lg object-cover bg-surface-hover",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
