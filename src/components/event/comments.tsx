"use client";

/**
 * Обсуждение события.
 *
 * Gamma отдаёт только счётчик комментариев (`event.commentCount`) — самих
 * текстов в публичном API нет. Поэтому лента здесь честно локальная: всё, что
 * написано, лежит в localStorage этого браузера и никуда не отправляется.
 *
 * Стор живёт прямо в этом файле: он больше нигде не нужен, а вынос в
 * @/lib/store сделал бы вид, будто у комментариев есть общая модель данных.
 * Гидратация устроена как в portfolio.ts — `skipHydration` плюс
 * useSyncExternalStore, иначе разметка сервера и клиента разъедется.
 */

import { MessageSquare, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatRelativeTime } from "@/lib/format";
import type { MarketEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "pm.comments.v1";
/** Дальше лента всё равно не читается, а localStorage не резиновый. */
const MAX_PER_EVENT = 200;
const MAX_LENGTH = 600;
const MAX_NAME = 24;
const GUEST = "Гость";

export interface EventComment {
  id: string;
  author: string;
  text: string;
  /** Unix-время в миллисекундах. */
  createdAt: number;
}

interface CommentsState {
  /** Подпись автора. В бумажном портфеле имени нет, поэтому храним здесь. */
  author: string;
  /** eventSlug → комментарии, новые сверху. */
  byEvent: Record<string, EventComment[]>;
  setAuthor: (name: string) => void;
  post: (eventSlug: string, text: string) => void;
  remove: (eventSlug: string, id: string) => void;
}

type PersistedComments = Pick<CommentsState, "author" | "byEvent">;

const NO_COMMENTS: EventComment[] = [];

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const useCommentsStore = create<CommentsState>()(
  persist(
    (set, get) => ({
      author: "",
      byEvent: {},

      setAuthor: (name) => {
        ensureHydrated();
        set({ author: name.slice(0, MAX_NAME) });
      },

      post: (eventSlug, text) => {
        ensureHydrated();
        const body = text.trim().slice(0, MAX_LENGTH);
        if (!eventSlug || !body) return;

        const state = get();
        const comment: EventComment = {
          id: makeId(),
          author: state.author.trim() || GUEST,
          text: body,
          createdAt: Date.now(),
        };
        const list = state.byEvent[eventSlug] ?? NO_COMMENTS;
        set({
          byEvent: {
            ...state.byEvent,
            [eventSlug]: [comment, ...list].slice(0, MAX_PER_EVENT),
          },
        });
      },

      remove: (eventSlug, id) => {
        ensureHydrated();
        const state = get();
        const list = state.byEvent[eventSlug];
        if (!list) return;
        set({
          byEvent: { ...state.byEvent, [eventSlug]: list.filter((item) => item.id !== id) },
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      skipHydration: true,
      storage: createJSONStorage<PersistedComments>(() => localStorage),
      partialize: (state): PersistedComments => ({
        author: state.author,
        byEvent: state.byEvent,
      }),
    },
  ),
);

let rehydrateRequested = false;

function ensureHydrated(): void {
  if (rehydrateRequested || typeof window === "undefined") return;
  rehydrateRequested = true;
  void useCommentsStore.persist.rehydrate();
}

function subscribeHydration(onChange: () => void): () => void {
  const unsubscribe = useCommentsStore.persist.onFinishHydration(onChange);
  ensureHydrated();
  return unsubscribe;
}

const getHydrationSnapshot = () => useCommentsStore.persist.hasHydrated();
const getServerHydrationSnapshot = () => false;

function useCommentsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeHydration,
    getHydrationSnapshot,
    getServerHydrationSnapshot,
  );
}

/* ------------------------------------------------------------------ */
/* Вид                                                                 */
/* ------------------------------------------------------------------ */

function CommentRow({
  comment,
  onRemove,
}: {
  comment: EventComment;
  onRemove: () => void;
}) {
  return (
    <li className="group flex items-start gap-3 py-3">
      <Avatar name={comment.author} seed={comment.author} size={32} />

      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-text">{comment.author}</span>
          <span className="shrink-0 text-[11px] text-faint">
            {formatRelativeTime(comment.createdAt)}
          </span>
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
          {comment.text}
        </p>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Удалить комментарий"
        // Кнопка видна всегда: на тач-экранах ховера нет, а удалять надо и там.
        className={cn(
          "shrink-0 cursor-pointer rounded-md p-1.5 text-faint transition-colors",
          "hover:bg-surface-hover hover:text-no group-hover:text-muted",
        )}
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

export function Comments({ event }: { event: MarketEvent }) {
  const hydrated = useCommentsHydrated();
  const author = useCommentsStore((state) => state.author);
  const stored = useCommentsStore((state) => state.byEvent[event.slug]);
  const setAuthor = useCommentsStore((state) => state.setAuthor);
  const post = useCommentsStore((state) => state.post);
  const remove = useCommentsStore((state) => state.remove);

  const [draft, setDraft] = useState("");

  const comments = hydrated ? (stored ?? NO_COMMENTS) : NO_COMMENTS;
  const body = draft.trim();
  const left = MAX_LENGTH - draft.length;

  function submit() {
    if (!body) return;
    post(event.slug, body);
    setDraft("");
  }

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-text">
          Обсуждение
          {comments.length > 0 && (
            <span className="tnum ml-1.5 text-xs font-normal text-faint">
              {comments.length}
            </span>
          )}
        </h3>
        {event.commentCount > 0 && (
          <p className="text-[11px] text-faint">
            На Polymarket {formatCompact(event.commentCount)} комментариев — сюда они не
            приезжают
          </p>
        )}
      </header>

      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="flex items-center gap-2">
          <Avatar name={author || GUEST} seed={author || GUEST} size={28} />
          <input
            type="text"
            value={author}
            maxLength={MAX_NAME}
            placeholder={GUEST}
            autoComplete="off"
            aria-label="Ваше имя"
            onChange={(e) => setAuthor(e.target.value)}
            className={cn(
              "min-w-0 flex-1 bg-transparent text-sm font-semibold text-text outline-none",
              "placeholder:font-normal placeholder:text-faint",
            )}
          />
        </div>

        <textarea
          value={draft}
          rows={2}
          maxLength={MAX_LENGTH}
          placeholder="Что думаете об этом событии?"
          aria-label="Текст комментария"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter отправляет, Shift+Enter — перенос строки.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className={cn(
            "mt-2 w-full resize-none bg-transparent text-sm leading-relaxed text-text outline-none",
            "placeholder:text-faint",
          )}
        />

        <div className="mt-1 flex items-center justify-end gap-3">
          {left <= 80 && (
            <span
              className={cn("tnum text-[11px]", left <= 0 ? "text-no" : "text-faint")}
            >
              {left}
            </span>
          )}
          <span className="mr-auto text-[11px] text-faint">
            Видно только вам — лента хранится в браузере
          </span>
          <Button type="button" size="sm" disabled={!body} onClick={submit}>
            Отправить
          </Button>
        </div>
      </div>

      {!hydrated ? (
        <div className="space-y-3 pt-1">
          {[0, 1].map((row) => (
            <div key={row} className="flex items-start gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title="Здесь пока пусто"
          description="Запишите, почему выбрали именно этот исход, — через месяц будет любопытно сравнить с результатом."
          className="py-10"
        />
      ) : (
        <ul className="divide-y divide-border">
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              onRemove={() => remove(event.slug, comment.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
