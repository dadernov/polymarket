"use client";

import { Plus, Search, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMounted } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { useHydrated, usePortfolioStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Container } from "./container";
import { Logo } from "./sidebar";
import { SearchDialog } from "./search-dialog";
import { ThemeToggle } from "./theme-toggle";

const DEPOSIT_AMOUNTS = [100, 500, 1000] as const;

/**
 * Баланс лежит в persist-хранилище: до гидратации сервер и клиент дали бы
 * разные суммы, поэтому сначала рисуем прочерк.
 */
function CashPill() {
  const cash = usePortfolioStore((s) => s.cash);
  const hydrated = useHydrated();

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-2.5 sm:px-3">
      <Wallet className="hidden size-3.5 text-faint sm:block" />
      <span className="tnum text-sm font-semibold text-text">
        {hydrated ? formatMoney(cash, 0) : "—"}
      </span>
    </div>
  );
}

function DepositButton() {
  const deposit = usePortfolioStore((s) => s.deposit);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(1000);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <Button
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Пополнить счёт"
        className="rounded-xl px-2.5 sm:px-3"
      >
        <Plus className="size-4" />
        <span className="hidden sm:inline">Пополнить</span>
      </Button>

      {open && (
        <div className="animate-rise absolute right-0 top-11 z-50 w-64 rounded-2xl border border-border bg-surface-raised p-3 shadow-pop">
          <p className="text-xs font-semibold text-text">Пополнить счёт</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Демо-режим: виртуальные деньги для тестовых ставок.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {DEPOSIT_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(value)}
                className={cn(
                  "tnum h-8 cursor-pointer rounded-lg border text-xs font-semibold transition-colors",
                  value === amount
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border text-muted hover:border-border-strong hover:text-text",
                )}
              >
                ${value}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            fullWidth
            className="mt-3 rounded-xl"
            onClick={() => {
              deposit(amount);
              setOpen(false);
            }}
          >
            Зачислить {formatMoney(amount, 0)}
          </Button>
        </div>
      )}
    </div>
  );
}

let macCache: boolean | null = null;
function isMacPlatform(): boolean {
  macCache ??= /Mac|iPhone|iPad/.test(navigator.userAgent);
  return macCache;
}

export function TopNav() {
  const [searchOpen, setSearchOpen] = useState(false);
  const mounted = useMounted();
  const isMac = mounted && isMacPlatform();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <Container>
          <div className="flex h-14 items-center gap-3">
            <Logo className="lg:hidden" compactLabel />

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={cn(
                "group flex h-9 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface",
                "text-sm text-faint transition-colors hover:border-border-strong hover:bg-surface-hover",
                "size-9 justify-center sm:w-full sm:max-w-[380px] sm:shrink sm:justify-start sm:px-3",
              )}
            >
              <Search className="size-4 shrink-0" />
              <span className="hidden truncate sm:inline">Поиск рынков</span>
              <kbd className="tnum ml-auto hidden rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-faint sm:inline-block">
                {isMac ? "⌘" : "Ctrl "}K
              </kbd>
            </button>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <CashPill />
              <DepositButton />
              <ThemeToggle className="lg:hidden" />
            </div>
          </div>
        </Container>
      </header>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
