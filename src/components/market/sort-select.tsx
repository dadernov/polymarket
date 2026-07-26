"use client";

import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/empty-state";
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

/**
 * Обновление одного параметра в адресной строке с сохранением остальных.
 * Смена фильтра — серверный переход (страница перечитывает searchParams и
 * заново идёт за данными), а не мгновенное состояние: `isPending` даёт
 * компонентам показать это явно, вместо замороженного на секунду интерфейса.
 */
function useParamWriter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const write = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);
    // Смена фильтра всегда возвращает ленту в начало.
    params.delete("offset");
    const qs = params.toString();
    startTransition(() => {
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  };

  return { write, isPending };
}

function SortSelectInner({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const { write, isPending } = useParamWriter();
  const urlSort = currentSort(searchParams.get("sort"));
  // Нативный <select> — управляемый компонент: если не обновить его value
  // сразу, React откатит выбранный пункт обратно, пока не придёт ответ
  // сервера, и переключение будет выглядеть так, будто оно не сработало.
  const [optimisticSort, setOptimisticSort] = useState<EventSort | null>(null);
  // Сброс во время рендера, а не в эффекте: как только сортировка в адресе
  // реально поменялась, оптимистичное значение больше не нужно.
  const [prevUrlSort, setPrevUrlSort] = useState(urlSort);
  if (urlSort !== prevUrlSort) {
    setPrevUrlSort(urlSort);
    setOptimisticSort(null);
  }
  const current = optimisticSort ?? urlSort;

  return (
    <label
      className={cn(
        CONTROL,
        "relative border-border bg-surface pl-3 pr-8 text-text transition-opacity hover:border-border-strong",
        isPending && "opacity-60",
        className,
      )}
    >
      <span className="sr-only">Сортировка</span>
      <select
        value={current}
        onChange={(event) => {
          const next = event.target.value as EventSort;
          setOptimisticSort(next);
          write("sort", next === DEFAULT_SORT ? null : next);
        }}
        className="cursor-pointer appearance-none bg-transparent pr-1 text-[13px] font-medium text-text outline-none"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value} className="bg-surface text-text">
            {option.label}
          </option>
        ))}
      </select>
      {isPending ? (
        <Spinner className="pointer-events-none absolute right-2.5 size-3.5 text-faint" />
      ) : (
        <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-faint" aria-hidden />
      )}
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
  const { write, isPending } = useParamWriter();
  const urlClosed = searchParams.get("closed") === "true";
  const [optimisticClosed, setOptimisticClosed] = useState<boolean | null>(null);
  // Сброс во время рендера, а не в эффекте — см. комментарий в SortSelectInner.
  const [prevUrlClosed, setPrevUrlClosed] = useState(urlClosed);
  if (urlClosed !== prevUrlClosed) {
    setPrevUrlClosed(urlClosed);
    setOptimisticClosed(null);
  }
  const closed = optimisticClosed ?? urlClosed;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={closed}
      onClick={() => {
        setOptimisticClosed(!closed);
        write("closed", closed ? null : "true");
      }}
      className={cn(
        CONTROL,
        "cursor-pointer gap-2 px-3 transition-opacity",
        closed
          ? "border-accent bg-accent-soft text-accent"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
        isPending && "opacity-60",
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
      {isPending && <Spinner className="size-3.5" />}
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
