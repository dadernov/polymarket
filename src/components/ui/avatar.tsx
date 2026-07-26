"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Детерминированный цвет плашки по адресу кошелька — как граватар. */
const PALETTE = [
  "#3aa9e6",
  "#23c37e",
  "#f2596e",
  "#b07cf0",
  "#efb757",
  "#4dd6c1",
  "#f08a4b",
  "#7a8cf5",
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function Avatar({
  src,
  name,
  seed,
  size = 28,
  className,
}: {
  src?: string | null;
  name?: string | null;
  /** Обычно адрес кошелька: даёт стабильный цвет между рендерами. */
  seed?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const key = seed || name || "?";
  const initial = (name?.trim()?.[0] ?? key.replace(/^0x/, "")[0] ?? "?").toUpperCase();

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name ?? "trader"}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: colorFor(key),
        fontSize: size * 0.42,
      }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
