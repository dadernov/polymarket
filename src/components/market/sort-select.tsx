"use client";

import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { EventSort } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Подписи к ключам сортировки. Сами ключи (и правило `ascending`) страницы
 * разбирают у себя: это «use client»-модуль, из серверного компонента его
 * экспорты вызвать нельзя — RSC отдаёт вместо них ссылки на клиент.
 */
const SORT_OPTIONS: readonly { value: EventSort; label: string }[] = [
  { value: "volume24hr", label: "Объём за 24ч" },
  { value: "volume", label: "Общий объём" },
  { value: "liquidity", label: "Ликвидность" },
  { value: "endDate", label: "Скоро закрытие" },
  { value: "competitive", label: "Конкурентные" },
] as const;

const DEFAULT_SORT: EventSort = "volume24hr";

function currentSort(value: string | null): EventSort {
  return SORT_OPTIONS.find((option) => option.value === value)?.value ?? DEFAULT_SORT;
}

const CONTROL =
  "flex h-9 shrink-0 items-center rounded-xl border text-[13px] font-medium transition-colors";

/** Обновление одного параметра в адресной строке с сохранением остальных. */
function useParamWriter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);
    // Смена фильтра всегда возвращает ленту в начало.
    params.delete("offset");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };
}

function SortSelectInner({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const write = useParamWriter();
  const current = currentSort(searchParams.get("sort"));

  return (
    <label
      className={cn(
        CONTROL,
        "relative border-border bg-surface pl-3 pr-8 text-text hover:border-border-strong",
        className,
      )}
    >
      <span className="sr-only">Сортировка</span>
      <select
        value={current}
        onChange={(event) =>
          write("sort", event.target.value === DEFAULT_SORT ? null : event.target.value)
        }
        className="cursor-pointer appearance-none bg-transparent pr-1 text-[13px] font-medium text-text outline-none"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value} className="bg-surface text-text">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-faint" aria-hidden />
    </label>
  );
}

/** Селект сортировки ленты. Значение хранится в search-параметре `sort`. */
export function SortSelect({ className }: { className?: string }) {
  return (
    <Suspense fallback={<Skeleton className="h-9 w-40 rounded-xl" />}>
      <SortSelectInner className={className} />
    </Suspense>
  );
}

function ClosedToggleInner({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const write = useParamWriter();
  const closed = searchParams.get("closed") === "true";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={closed}
      onClick={() => write("closed", closed ? null : "true")}
      className={cn(
        CONTROL,
        "cursor-pointer gap-2 px-3",
        closed
          ? "border-accent bg-accent-soft text-accent"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
        className,
      )}
    >
      <span
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors",
          closed ? "bg-accent" : "bg-border-strong",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-0.5 size-3 rounded-full bg-white transition-[left] duration-150",
            closed ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
      Завершённые
    </button>
  );
}

/** Переключатель «показывать закрытые рынки» — параметр `closed`. */
export function ClosedToggle({ className }: { className?: string }) {
  return (
    <Suspense fallback={<Skeleton className="h-9 w-36 rounded-xl" />}>
      <ClosedToggleInner className={className} />
    </Suspense>
  );
}
