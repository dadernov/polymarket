"use client";

/**
 * Мини-тосты без зависимостей: модульный zustand-стор + один вьюпорт.
 * Вьюпорт рендерит сама торговая панель, поэтому подключать что-то в layout
 * не нужно. Всё живёт в этом файле намеренно — вынести можно в любой момент.
 *
 * Вид: карточка «ledger» с цветной кромкой слева, капительной пометкой исхода
 * и подписью табличными цифрами. Цвет несёт только кромка и иконка — заливать
 * весь тост зелёным значило бы кричать там, где достаточно отметки.
 */

import { Check, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo } from "react";
import { create } from "zustand";

import { useMounted } from "@/components/providers";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error";

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, "id">) => string;
  dismiss: (id: string) => void;
}

/** Сколько тостов держим на экране и как долго. */
const MAX_VISIBLE = 3;
const TTL_MS = 4000;

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-MAX_VISIBLE) }));
    return id;
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export interface ToastApi {
  toast: (toast: Omit<ToastItem, "id">) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
}

export function useToast(): ToastApi {
  const push = useToastStore((state) => state.push);
  const dismiss = useToastStore((state) => state.dismiss);

  return useMemo(
    () => ({
      toast: push,
      success: (title, description) => push({ tone: "success", title, description }),
      error: (title, description) => push({ tone: "error", title, description }),
      dismiss,
    }),
    [push, dismiss],
  );
}

const TONES: Record<ToastTone, { edge: string; mark: string; kicker: string }> = {
  success: {
    edge: "border-l-yes",
    mark: "bg-yes-soft text-yes",
    kicker: "Исполнено",
  },
  error: {
    edge: "border-l-no",
    mark: "bg-no-soft text-no",
    kicker: "Отклонено",
  },
};

function ToastCard({ toast }: { toast: ToastItem }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const tone = TONES[toast.tone];

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), TTL_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, dismiss]);

  const Icon = toast.tone === "success" ? Check : X;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "animate-rise pointer-events-auto flex w-[min(21rem,calc(100vw-2rem))] items-start gap-3",
        "rounded-[16px] border border-l-[3px] border-border bg-surface-raised p-3.5 shadow-pop",
        tone.edge,
      )}
    >
      <span
        className={cn(
          "mt-px flex size-6 shrink-0 items-center justify-center rounded-full",
          tone.mark,
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-faint">
          {tone.kicker}
        </p>
        <p className="mt-1 text-[13px] font-semibold leading-tight text-text">{toast.title}</p>
        {toast.description && (
          <p className="tnum mt-1 text-[11.5px] leading-relaxed text-muted">
            {toast.description}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Закрыть уведомление"
        className="-m-1 cursor-pointer rounded-[8px] p-1 text-faint transition-colors hover:bg-surface-hover hover:text-text"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Стопка тостов в правом нижнем углу. Рендерится в body, чтобы её не резали
 *  родительские overflow/transform торговой колонки. */
export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const mounted = useMounted();

  if (!mounted) return null;

  // Ниже lg внизу экрана живёт мобильная навигация — стопка встаёт над ней.
  return createPortal(
    <div className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col items-end gap-2.5 sm:inset-x-auto sm:right-4 lg:bottom-4">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body,
  );
}
