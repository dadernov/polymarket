"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { api, queryKeys } from "@/lib/api";
import type { Tag } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
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

const SHELL =
  "sticky top-14 z-30 border-b border-border bg-bg/80 backdrop-blur-xl";
const ROW = "no-scrollbar fade-edges flex items-center gap-2 overflow-x-auto py-2.5";

function CategoryBarInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rowRef = useRef<HTMLDivElement>(null);

  const active = searchParams.get("tag") ?? "all";

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
    const params = new URLSearchParams(searchParams.toString());
    if (slug === "all") params.delete("tag");
    else params.set("tag", slug);
    params.delete("offset");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  return (
    <div className={SHELL}>
      <Container>
        <div ref={rowRef} className={ROW}>
          {chips.map((tag) => {
            const isActive = tag.slug === active;
            return (
              <button
                key={tag.id}
                type="button"
                data-slug={tag.slug}
                aria-pressed={isActive}
                onClick={() => select(tag.slug)}
                className={cn(
                  "h-8 shrink-0 cursor-pointer rounded-full border px-3.5",
                  "text-[13px] font-medium transition-colors",
                  isActive
                    ? "border-transparent bg-text text-bg"
                    : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
                )}
              >
                {tag.label}
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
          {["w-14", "w-20", "w-16", "w-24", "w-18", "w-20", "w-16"].map(
            (w, i) => (
              <Skeleton
                key={i}
                className={cn("h-8 shrink-0 rounded-full", w)}
              />
            ),
          )}
        </div>
      </Container>
    </div>
  );
}

/** useSearchParams требует Suspense-границы — оборачиваем прямо здесь. */
export function CategoryBar() {
  return (
    <Suspense fallback={<CategoryBarFallback />}>
      <CategoryBarInner />
    </Suspense>
  );
}
