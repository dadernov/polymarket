"use client";

/**
 * Избранные события — набор slug'ов в localStorage.
 *
 * Гидратация устроена так же, как в portfolio.ts: `skipHydration: true`,
 * первый рендер отдаёт пустой список, реальные данные приезжают в useEffect.
 * Для звёздочки в карточке используйте `useIsWatched(slug)` — он уже
 * учитывает гидратацию и до неё возвращает false.
 */

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const STORAGE_KEY = "pm.watchlist.v1";

export interface WatchlistState {
  slugs: string[];
  toggle: (slug: string) => void;
  add: (slug: string) => void;
  remove: (slug: string) => void;
  has: (slug: string) => boolean;
  clear: () => void;
}

type PersistedWatchlist = Pick<WatchlistState, "slugs">;

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      slugs: [],

      toggle: (slug) => {
        ensureWatchlistHydrated();
        if (!slug) return;
        const slugs = get().slugs;
        set({ slugs: slugs.includes(slug) ? slugs.filter((s) => s !== slug) : [slug, ...slugs] });
      },

      add: (slug) => {
        ensureWatchlistHydrated();
        if (!slug) return;
        const slugs = get().slugs;
        if (slugs.includes(slug)) return;
        set({ slugs: [slug, ...slugs] });
      },

      remove: (slug) => {
        ensureWatchlistHydrated();
        if (!slug) return;
        set({ slugs: get().slugs.filter((s) => s !== slug) });
      },

      has: (slug) => (slug ? get().slugs.includes(slug) : false),

      clear: () => {
        ensureWatchlistHydrated();
        set({ slugs: [] });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      skipHydration: true,
      storage: createJSONStorage<PersistedWatchlist>(() => localStorage),
      partialize: (state): PersistedWatchlist => ({ slugs: state.slugs }),
    },
  ),
);

/** Короткий алиас: `useWatchlist((s) => s.slugs)`. */
export const useWatchlist = useWatchlistStore;

let rehydrateRequested = false;

function ensureWatchlistHydrated(): void {
  if (rehydrateRequested || typeof window === "undefined") return;
  rehydrateRequested = true;
  void useWatchlistStore.persist.rehydrate();
}

function subscribeHydration(onChange: () => void): () => void {
  const unsubscribe = useWatchlistStore.persist.onFinishHydration(onChange);
  ensureWatchlistHydrated();
  return unsubscribe;
}

const getHydrationSnapshot = () => useWatchlistStore.persist.hasHydrated();
const getServerHydrationSnapshot = () => false;

/** true после чтения localStorage; сервер и первый клиентский рендер — false. */
export function useWatchlistHydrated(): boolean {
  return useSyncExternalStore(
    subscribeHydration,
    getHydrationSnapshot,
    getServerHydrationSnapshot,
  );
}

/** Реактивная проверка «в избранном ли событие», безопасная для SSR. */
export function useIsWatched(slug: string): boolean {
  const hydrated = useWatchlistHydrated();
  const watched = useWatchlistStore((state) => state.slugs.includes(slug));
  return hydrated && watched;
}
