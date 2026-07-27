"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { api, queryKeys } from "@/lib/api";
import type { Tag } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/empty-state";
import { Container } from "./container";

const ALL: Tag = { id: "all", label: "All", slug: "all" };

/** Пока /api/tags не ответил (или упал) — показываем осмысленный минимум. */
const FALLBACK_TAGS: Tag[] = [
  { id: "f-politics", label: "Politics", slug: "politics" },
  { id: "f-sports", label: "Sports", slug: "sports" },
  { id: "f-crypto", label: "Crypto", slug: "crypto" },
  { id: "f-economy", label: "Economy", slug: "economy" },
  { id: "f-tech", label: "Tech", slug: "tech" },
  { id: "f-culture", label: "Culture", slug: "culture" },
  { id: "f-world", label: "World", slug: "world" },
  { id: "f-elections", label: "Elections", slug: "elections" },
];

/** Ленту показываем только там, где под ней действительно есть список рынков. */
const LIST_ROUTES = new Set(["/", "/markets"]);

// 65px — высота шапки вместе с её нижней рамкой: лента встаёт вплотную под ней,
// не перекрывая линию и не оставляя щели, через которую просвечивает контент.
const SHELL = "glass sticky top-[65px] z-30 border-b border-border";
const ROW = "no-scrollbar fade-edges flex items-center gap-2 overflow-x-auto py-3";

function CategoryBarInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rowRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  const urlActive = searchParams.get("tag") ?? "all";
  // Смена категории — это серверный переход, не мгновенное состояние: пока
  // страница не перерендерилась (может занимать больше секунды), подсвечиваем
  // нажатый чип оптимистично, иначе клик выглядит так, будто ничего не вышло.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  // Сброс во время рендера, а не в эффекте: как только реальный tag в адресе
  // изменился (переход завершился или сработала кнопка «назад»), оптимистичное
  // значение уже не нужно — react-hooks/set-state-in-effect requires this.
  const [prevUrlActive, setPrevUrlActive] = useState(urlActive);
  if (urlActive !== prevUrlActive) {
    setPrevUrlActive(urlActive);
    setOptimistic(null);
  }
  const active = optimistic ?? urlActive;

  const { data } = useQuery({
    queryKey: queryKeys.tags(),
    queryFn: ({ signal }) => api.tags(signal),
    staleTime: 300_000,
  });

  const chips = useMemo(() => {
    const fromApi = data ?? [];
    // Апстрим иногда отдаёт две-три категории — таким списком ленту не набьёшь,
    // поэтому дополняем её запасными.
    const source =
      fromApi.length >= 4 ? fromApi : [...fromApi, ...FALLBACK_TAGS];
    const seen = new Set<string>(["all"]);
    const rest = source.filter((tag) => {
      if (!tag.slug || seen.has(tag.slug)) return false;
      seen.add(tag.slug);
      return true;
    });
    return [ALL, ...rest.slice(0, 28)];
  }, [data]);

  // Выбранная категория может оказаться далеко справа — подтягиваем её в кадр.
  useEffect(() => {
    rowRef.current
      ?.querySelector<HTMLElement>(`[data-slug="${CSS.escape(active)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active, chips.length]);

  const select = (slug: string) => {
    if (slug === active) return;
    setOptimistic(slug);
    const params = new URLSearchParams(searchParams.toString());
    if (slug === "all") params.delete("tag");
    else params.set("tag", slug);
    params.delete("offset");
    const qs = params.toString();
    startTransition(() => {
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  };

  return (
    <div className={SHELL}>
      <Container>
        <div
          ref={rowRef}
          className={cn(ROW, "transition-opacity", isPending && "opacity-60")}
        >
          {chips.map((tag) => {
            const isActive = tag.slug === active;
            const isLoadingThis = isPending && isActive && tag.slug !== urlActive;
            return (
              <button
                key={tag.id}
                type="button"
                data-slug={tag.slug}
                aria-pressed={isActive}
                onClick={() => select(tag.slug)}
                className={cn(
                  "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4",
                  "text-[13px] transition-colors",
                  isActive
                    ? "border-transparent bg-text font-semibold text-bg"
                    : "border-border bg-surface font-medium text-muted hover:border-border-strong hover:text-text",
                )}
              >
                {tag.label}
                {isLoadingThis && (
                  <Spinner className="size-3 text-bg" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </Container>
    </div>
  );
}

function CategoryBarFallback() {
  return (
    <div className={SHELL}>
      <Container>
        <div className={ROW}>
          {["w-16", "w-24", "w-20", "w-28", "w-20", "w-24", "w-16"].map(
            (w, i) => (
              <Skeleton
                key={i}
                className={cn("h-9 shrink-0 rounded-full", w)}
              />
            ),
          )}
        </div>
      </Container>
    </div>
  );
}

/**
 * Лента живёт только на страницах списков: на карточке события или в портфеле
 * фильтр категорий ни на что не влияет и лишь съедает высоту экрана.
 * useSearchParams требует Suspense-границы — оборачиваем прямо здесь.
 */
export function CategoryBar() {
  const pathname = usePathname();
  if (!LIST_ROUTES.has(pathname)) return null;

  return (
    <Suspense fallback={<CategoryBarFallback />}>
      <CategoryBarInner />
    </Suspense>
  );
}
