"use client";

import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  /** Счётчик справа от названия — например число позиций. */
  count?: number;
}

/** Подчёркнутые вкладки — навигация внутри страницы события и портфеля. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "no-scrollbar flex gap-6 overflow-x-auto border-b border-border",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative -mb-px shrink-0 cursor-pointer border-b-2 pb-3 pt-1",
              "text-sm font-medium transition-colors",
              active
                ? "border-text text-text"
                : "border-transparent text-muted hover:text-text",
            )}
          >
            {item.label}
            {item.count != null && item.count > 0 && (
              <span className="tnum ml-1.5 text-xs text-faint">{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Компактные вкладки-«пилюли»: интервалы графика, стороны сделки. */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  className,
  size = "sm",
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "xs" | "sm";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg bg-bg-subtle p-0.5",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            aria-pressed={active}
            className={cn(
              "cursor-pointer rounded-md font-medium transition-colors",
              size === "xs" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs",
              active
                ? "bg-surface text-text shadow-card"
                : "text-muted hover:text-text",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
