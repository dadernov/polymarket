"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, CornerDownLeft, Hash, Search, SearchX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { api, queryKeys } from "@/lib/api";
import { formatVolume } from "@/lib/format";
import type { MarketEvent, Tag } from "@/lib/types";
import { cn, eventHref } from "@/lib/utils";
import { MarketImage } from "@/components/ui/market-image";
import { Spinner } from "@/components/ui/empty-state";

const RECENT_KEY = "pm:recent-searches";
const RECENT_MAX = 6;

type Row =
  | { kind: "event"; key: string; event: MarketEvent }
  | { kind: "tag"; key: string; tag: Tag }
  | { kind: "recent"; key: string; text: string };

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string").slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

/** Наружный контракт; состояние живёт в Inner и обнуляется при каждом открытии. */
export function SearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return <SearchDialogInner onClose={onClose} />;
}

function SearchDialogInner({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  // Курсор помним вместе с запросом: сменился запрос — подсветка снова сверху.
  const [cursorAt, setCursorAt] = useState({ query: "", index: 0 });
  const [recent, setRecent] = useState<string[]>(readRecent);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  const enabled = debounced.length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.search(debounced),
    queryFn: ({ signal }) => api.search(debounced, signal),
    enabled,
    staleTime: 60_000,
  });

  const sections = useMemo(() => {
    if (!enabled) {
      return recent.length
        ? [
            {
              title: "Недавние запросы",
              rows: recent.map<Row>((text) => ({
                kind: "recent",
                key: `r-${text}`,
                text,
              })),
            },
          ]
        : [];
    }
    const out: { title: string; rows: Row[] }[] = [];
    const events = data?.events?.slice(0, 8) ?? [];
    const tags = data?.tags?.slice(0, 6) ?? [];
    if (events.length) {
      out.push({
        title: "События",
        rows: events.map<Row>((event) => ({
          kind: "event",
          key: `e-${event.id}`,
          event,
        })),
      });
    }
    if (tags.length) {
      out.push({
        title: "Категории",
        rows: tags.map<Row>((tag) => ({ kind: "tag", key: `t-${tag.id}`, tag })),
      });
    }
    return out;
  }, [enabled, data, recent]);

  const flat = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  const cursor =
    cursorAt.query === debounced
      ? Math.min(cursorAt.index, Math.max(flat.length - 1, 0))
      : 0;
  const setCursor = (index: number) => setCursorAt({ query: debounced, index });

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const remember = useCallback((text: string) => {
    const value = text.trim();
    if (value.length < 2) return;
    const next = [value, ...readRecent().filter((v) => v !== value)].slice(
      0,
      RECENT_MAX,
    );
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // приватный режим — история просто не сохранится
    }
    setRecent(next);
  }, []);

  const select = useCallback(
    (row: Row) => {
      if (row.kind === "recent") {
        setQuery(row.text);
        inputRef.current?.focus();
        return;
      }
      remember(debounced);
      onClose();
      router.push(
        row.kind === "event"
          ? eventHref(row.event.slug)
          : `/?tag=${encodeURIComponent(row.tag.slug)}`,
      );
    },
    [debounced, onClose, remember, router],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!flat.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((cursor + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((cursor - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = flat[cursor];
      if (row) select(row);
    }
  };

  const showEmpty = enabled && !isFetching && flat.length === 0;
  let index = -1;

  return (
    <div className="fixed inset-0 z-100" role="dialog" aria-modal="true">
      <div
        className="animate-fade-in absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        onKeyDown={onKeyDown}
        className={cn(
          "animate-rise absolute inset-0 flex flex-col overflow-hidden bg-bg",
          "sm:inset-auto sm:left-1/2 sm:top-[10vh] sm:max-h-[70vh] sm:w-[min(640px,92vw)]",
          "sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:border-border sm:shadow-pop",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск событий и категорий…"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-faint"
          />
          {isFetching && <Spinner className="size-4" />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть поиск"
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-faint transition-colors hover:bg-surface-hover hover:text-text"
          >
            <X className="size-4" />
          </button>
        </div>

        <div ref={listRef} className="thin-scrollbar flex-1 overflow-y-auto p-2">
          {sections.map((section) => (
            <div key={section.title} className="mb-1">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
                {section.title}
              </p>
              {section.rows.map((row) => {
                index += 1;
                const idx = index;
                const active = idx === cursor;
                return (
                  <button
                    key={row.key}
                    type="button"
                    data-idx={idx}
                    onMouseMove={() => setCursor(idx)}
                    onClick={() => select(row)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                      active ? "bg-surface-hover" : "hover:bg-surface",
                    )}
                  >
                    {row.kind === "event" && (
                      <>
                        <MarketImage
                          src={row.event.icon ?? row.event.image}
                          alt=""
                          size={32}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-1 text-sm font-medium text-text">
                            {row.event.title}
                          </span>
                          <span className="tnum mt-0.5 block text-xs text-faint">
                            {formatVolume(row.event.volume)} объём
                          </span>
                        </span>
                      </>
                    )}
                    {row.kind === "tag" && (
                      <>
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-hover text-faint">
                          <Hash className="size-4" />
                        </span>
                        <span className="flex-1 truncate text-sm font-medium text-text">
                          {row.tag.label}
                        </span>
                      </>
                    )}
                    {row.kind === "recent" && (
                      <>
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-hover text-faint">
                          <Clock className="size-4" />
                        </span>
                        <span className="flex-1 truncate text-sm text-muted">
                          {row.text}
                        </span>
                      </>
                    )}
                    {active && (
                      <CornerDownLeft className="size-3.5 shrink-0 text-faint" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {showEmpty && (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <SearchX className="size-7 text-faint" />
              <p className="text-sm font-semibold text-text">Ничего не найдено</p>
              <p className="text-sm text-muted">
                Попробуйте другой запрос — например «election» или «bitcoin».
              </p>
            </div>
          )}

          {!enabled && !sections.length && (
            <p className="px-3 py-12 text-center text-sm text-muted">
              Введите минимум два символа, чтобы начать поиск.
            </p>
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-faint sm:flex">
          <span>↑ ↓ — навигация</span>
          <span>Enter — открыть</span>
          <span>Esc — закрыть</span>
        </div>
      </div>
    </div>
  );
}
