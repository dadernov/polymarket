"use client";

import { ChevronDown, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/empty-state";
import type { EventSort } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Подписи к ключам сортировки. Сами ключи (и правило `ascending`) страницы
 * разбирают у себя: это «use client»-модуль, из серверного компонента его
 * экспорты вызвать нельзя — RSC отдаёт вместо них ссылки на клиент. Поэтому
 * набор ключей продублирован в src/app/markets/page.tsx — менять оба места.
 */
const SORT_OPTIONS: readonly { value: EventSort; label: string }[] = [
  { value: "volume24hr", label: "Объём за 24 часа" },
  { value: "volume", label: "Общий объём" },
  { value: "liquidity", label: "Ликвидность" },
  { value: "endDate", label: "Скоро закрытие" },
  { value: "competitive", label: "Спорность исхода" },
] as const;

const DEFAULT_SORT: EventSort = "volume24hr";

function currentSort(value: string | null): EventSort {
  return SORT_OPTIONS.find((option) => option.value === value)?.value ?? DEFAULT_SORT;
}

/** Единая гильза для всех контролов каталога: одна высота, один радиус. */
const CONTROL =
  "flex h-10 shrink-0 items-center rounded-[12px] border text-[13.5px] font-medium transition-colors";

/** Капительная подпись внутри контрола — «издательская» метка поля. */
const CAPTION =
  "text-[9.5px] font-semibold uppercase leading-none tracking-[0.16em] text-faint";

/** Задержка перед записью поискового запроса в адрес: одна буква — не запрос. */
const SEARCH_DEBOUNCE = 400;

/**
 * Обновление параметров в адресной строке с сохранением остальных.
 * Смена фильтра — серверный переход (страница перечитывает searchParams и
 * заново идёт за данными), а не мгновенное состояние: `isPending` даёт
 * компонентам показать это явно, вместо замороженного на секунду интерфейса.
 */
function useParamWriter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const write = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
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
      <span className={cn(CAPTION, "mr-2 hidden shrink-0 sm:block")} aria-hidden>
        сортировка
      </span>
      <select
        aria-label="Сортировка ленты"
        value={current}
        onChange={(event) => {
          const next = event.target.value as EventSort;
          setOptimisticSort(next);
          write({ sort: next === DEFAULT_SORT ? null : next });
        }}
        className="cursor-pointer appearance-none bg-transparent pr-1 text-[13.5px] font-semibold text-text outline-none"
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
    <Suspense fallback={<Skeleton className="h-10 w-52 rounded-[12px]" />}>
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
      aria-label="Показывать завершённые рынки"
      onClick={() => {
        setOptimisticClosed(!closed);
        // Архив и поиск живут в разных апстримах: поиск отдаёт только активные
        // события, поэтому при переходе в архив запрос сбрасываем.
        write({ closed: closed ? null : "true", q: null });
      }}
      className={cn(
        CONTROL,
        "cursor-pointer gap-2.5 px-3 transition-opacity",
        closed
          ? "border-accent bg-accent-soft text-accent"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
        isPending && "opacity-60",
        className,
      )}
    >
      <span
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full transition-colors",
          closed ? "bg-accent" : "bg-border-strong",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-0.5 size-3 rounded-full bg-bg transition-[left] duration-150",
            closed ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
      <span className="text-[10.5px] font-semibold uppercase leading-none tracking-[0.1em]">
        Завершённые
      </span>
      {isPending && <Spinner className="size-3.5" />}
    </button>
  );
}

/** Переключатель «показывать закрытые рынки» — параметр `closed`. */
export function ClosedToggle({ className }: { className?: string }) {
  return (
    <Suspense fallback={<Skeleton className="h-10 w-44 rounded-[12px]" />}>
      <ClosedToggleInner className={className} />
    </Suspense>
  );
}

function MarketSearchInner({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const { write, isPending } = useParamWriter();
  const urlQuery = searchParams.get("q") ?? "";

  // Поле ввода живёт своим состоянием: буквы должны появляться мгновенно,
  // а в адрес запрос уходит с задержкой, иначе апстрим получит запрос на
  // каждое нажатие клавиши.
  const [draft, setDraft] = useState(urlQuery);
  // Что мы сами последним отправили в адрес. Без этого наша же отложенная
  // запись, доехав до страницы, затирала бы уже набранный дальше текст.
  const [sent, setSent] = useState(urlQuery);
  // Сверка во время рендера, а не в эффекте (линтер запрещает setState в
  // эффекте): реагируем только на чужие изменения адреса — «назад/вперёд»,
  // сброс фильтров, переключение архива.
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);
  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    if (urlQuery !== sent) {
      setDraft(urlQuery);
      setSent(urlQuery);
    }
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const commit = (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    const trimmed = value.trim();
    if (trimmed === sent) return;
    setSent(trimmed);
    // Поиск отдаёт только активные события: оставить включённым переключатель
    // архива значило бы показывать состояние, которого в подборке нет.
    write(trimmed ? { q: trimmed, closed: null } : { q: null });
  };

  const schedule = (value: string) => {
    setDraft(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(value), SEARCH_DEBOUNCE);
  };

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        commit(draft);
      }}
      className={cn(
        "relative flex h-10 min-w-0 items-center rounded-[12px] border border-border bg-surface",
        "transition-colors focus-within:border-border-strong",
        className,
      )}
    >
      <Search className="pointer-events-none absolute left-3 size-4 text-faint" aria-hidden />
      <input
        type="text"
        value={draft}
        onChange={(event) => schedule(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && draft) {
            setDraft("");
            commit("");
          }
        }}
        placeholder="Найти рынок по названию"
        aria-label="Поиск по каталогу рынков"
        autoComplete="off"
        className={cn(
          "h-full w-full min-w-0 rounded-[12px] bg-transparent pl-9 pr-9",
          "text-[13.5px] font-medium text-text outline-none placeholder:font-normal placeholder:text-faint",
        )}
      />
      {isPending ? (
        <Spinner className="pointer-events-none absolute right-3 size-3.5 text-faint" />
      ) : (
        draft && (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              commit("");
            }}
            aria-label="Очистить поиск"
            className="absolute right-2 flex size-6 cursor-pointer items-center justify-center rounded-full text-faint transition-colors hover:bg-surface-hover hover:text-text"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )
      )}
    </form>
  );
}

/**
 * Поиск внутри каталога. Запрос хранится в параметре `q`, поэтому подборку
 * можно переслать ссылкой — в отличие от диалога поиска в шапке.
 */
export function MarketSearch({ className }: { className?: string }) {
  return (
    <Suspense fallback={<Skeleton className={cn("h-10 rounded-[12px]", className)} />}>
      <MarketSearchInner className={className} />
    </Suspense>
  );
}
