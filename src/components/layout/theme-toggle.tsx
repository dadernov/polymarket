"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useMounted } from "@/components/providers";
import { cn } from "@/lib/utils";

/**
 * Переключатель темы. До монтирования настоящая тема неизвестна (её ставит
 * скрипт next-themes уже в браузере), поэтому рисуем нейтральную заглушку —
 * иначе гидратация ругается на несовпадение иконки.
 */
export function ThemeToggle({
  className,
  withLabel = false,
}: {
  className?: string;
  withLabel?: boolean;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const base = cn(
    "inline-flex cursor-pointer items-center gap-2 rounded-xl transition-colors",
    "text-muted hover:bg-surface-hover hover:text-text",
    withLabel
      ? "h-9 w-full px-3 text-sm font-medium"
      : "size-9 justify-center",
    className,
  );

  if (!mounted) {
    return <span className={base} aria-hidden />;
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={base}
      aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={isDark ? "Светлая тема" : "Тёмная тема"}
    >
      {isDark ? (
        <Sun className="size-4 shrink-0" />
      ) : (
        <Moon className="size-4 shrink-0" />
      )}
      {withLabel && <span>{isDark ? "Светлая тема" : "Тёмная тема"}</span>}
    </button>
  );
}
