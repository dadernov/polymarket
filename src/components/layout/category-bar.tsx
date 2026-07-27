"use client";

import { useQuery } from "@tanstack/react-query";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, eventsPath, queryKeys } from "@/lib/api";
import type { Tag } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/empty-state";
import { useEdgeFade } from "@/components/ui/use-edge-fade";
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

/** Столько же событий берёт первая страница списка — иначе разогрев промахнётся
 *  мимо нужной записи кэша (ключ включает limit). */
const PAGE_SIZE = 24;

// 65px — высота шапки вместе с её нижней рамкой: лента встаёт вплотную под ней,
// не перекрывая линию и не оставляя щели, через которую просвечивает контент.
const SHELL = "glass sticky top-[65px] z-30 border-b border-border";
const ROW = "no-scrollbar flex items-center gap-2 overflow-x-auto py-3";

/** Спиннер внутри чипа: useLinkStatus читает состояние своего <Link>. */
function ChipPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Spinner className="size-3 text-current" aria-hidden />;
}

function CategoryBarInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ref, edges, style, onScroll, nudge } = useEdgeFade<HTMLDivElement>();
  const didAutoScroll = useRef(false);

  const urlActive = searchParams.get("tag") ?? "all";
  // Переход по категории — серверный, и до его завершения подсветка обязана
  // переехать сама, иначе клик выглядит так, будто ничего не произошло.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  // Сброс во время рендера, а не в эффекте: линтер запрещает setState в эффекте,
  // а адрес меняется и по кнопке «назад», не только по нашему клику.
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
    const source = fromApi.length >= 4 ? fromApi : [...fromApi, ...FALLBACK_TAGS];
    const seen = new Set<string>(["all"]);
    const rest = source.filter((tag) => {
      if (!tag.slug || seen.has(tag.slug)) return false;
      seen.add(tag.slug);
      return true;
    });
    return [ALL, ...rest.slice(0, 28)];
  }, [data]);

  const hrefFor = useCallback(
    (slug: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (slug === "all") params.delete("tag");
      else params.set("tag", slug);
      // Смена фильтра всегда возвращает ленту в начало.
      params.delete("offset");
      const qs = params.toString();
      return `${pathname}${qs ? `?${qs}` : ""}`;
    },
    [pathname, searchParams],
  );

  /**
   * Разогрев по наведению.
   *
   * Секунда задержки при смене категории — это не отрисовка, а ответ Gamma:
   * холодный рендер страницы категории занимает ~1.0с, из которых ~0.9с
   * приходится на апстрим, а повторный укладывается в 0.03с. Наш `/api/events`
   * ходит за теми же данными с теми же параметрами и делит с рендером страницы
   * одну запись кэша `fetch`, поэтому дёрнуть его на наведении — значит
   * прогреть ровно ту запись, которая понадобится странице через мгновение.
   * Предзагрузка самого маршрута этого не делает: у динамической страницы с
   * `loading.tsx` она забирает только оболочку.
   */
  const warmed = useRef(new Set<string>());
  const warm = useCallback(
    (slug: string, href: string) => {
      router.prefetch(href);
      if (warmed.current.has(slug)) return;
      warmed.current.add(slug);
      const sort = searchParams.get("sort") ?? undefined;
      void fetch(eventsPath({ tag: slug, sort, limit: PAGE_SIZE }), {
        // Ответ не нужен — важен побочный эффект на сервере.
        priority: "low",
      }).catch(() => warmed.current.delete(slug));
    },
    [router, searchParams],
  );

  // Выбранную категорию подтягиваем в кадр, только если её реально не видно, и
  // никогда — при первой отрисовке: иначе лента дёргается на каждой загрузке.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!didAutoScroll.current) {
      didAutoScroll.current = true;
      return;
    }
    const chip = el.querySelector<HTMLElement>(`[data-slug="${CSS.escape(active)}"]`);
    if (!chip) return;
    const chipLeft = chip.offsetLeft;
    const chipRight = chipLeft + chip.offsetWidth;
    if (chipLeft < el.scrollLeft || chipRight > el.scrollLeft + el.clientWidth) {
      chip.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }, [active, ref]);

  return (
    <div className={SHELL}>
      <Container className="relative">
        {(["left", "right"] as const).map((side) =>
          edges[side] ? (
            <button
              key={side}
              type="button"
              aria-label={side === "left" ? "Прокрутить влево" : "Прокрутить вправо"}
              onClick={() => nudge(side === "left" ? -1 : 1)}
              className={cn(
                "absolute top-1/2 z-10 hidden size-7 -translate-y-1/2 items-center justify-center",
                "rounded-full border border-border bg-surface text-muted shadow-card",
                "transition-colors hover:border-border-strong hover:text-text sm:flex",
                side === "left" ? "left-1" : "right-1",
              )}
            >
              {side === "left" ? (
                <ChevronLeft className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
            </button>
          ) : null,
        )}

        <div ref={ref} onScroll={onScroll} className={ROW} style={style}>
          {chips.map((tag) => {
            const isActive = tag.slug === active;
            const href = hrefFor(tag.slug);
            return (
              <Link
                key={tag.id}
                href={href}
                replace
                scroll={false}
                data-slug={tag.slug}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setOptimistic(tag.slug)}
                onPointerEnter={() => warm(tag.slug, href)}
                onFocus={() => warm(tag.slug, href)}
                className={cn(
                  "flex h-9 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-full border px-4",
                  "text-[13px] transition-colors",
                  isActive
                    ? "border-transparent bg-text font-semibold text-bg"
                    : "border-border bg-surface font-medium text-muted hover:border-border-strong hover:text-text",
                )}
              >
                {tag.label}
                <ChipPending />
              </Link>
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
          {["w-16", "w-24", "w-20", "w-28", "w-20", "w-24", "w-16"].map((w, i) => (
            <Skeleton key={i} className={cn("h-9 shrink-0 rounded-full", w)} />
          ))}
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
