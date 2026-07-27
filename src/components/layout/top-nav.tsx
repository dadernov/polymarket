"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LayoutGrid, Plus, Search, Trophy, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMounted } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { useHydrated, usePortfolioStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Container } from "./container";
import { SearchDialog } from "./search-dialog";
import { ThemeToggle } from "./theme-toggle";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Основные разделы. Тот же список использует нижняя панель на мобильных. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Рынки", icon: LayoutGrid },
  { href: "/portfolio", label: "Портфель", icon: Wallet },
  { href: "/activity", label: "Активность", icon: Activity },
  { href: "/leaderboard", label: "Лидеры", icon: Trophy },
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // Сравниваем по сегментам: /portfolio не должен подсвечиваться на /portfolio-x.
  return pathname === href || pathname.startsWith(`${href}/`);
}

const DEPOSIT_AMOUNTS = [100, 500, 1000] as const;

/**
 * Словесный знак вместо иконки-логотипа: антиква и капительный дескриптор
 * читаются как шапка делового издания, а не как ещё один крипто-бейдж.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Кворум — на главную"
      className={cn(
        "flex shrink-0 flex-col justify-center transition-opacity hover:opacity-70",
        className,
      )}
    >
      <span className="display text-[21px] leading-none text-text">
        Кворум<span className="text-accent">.</span>
      </span>
      <span className="mt-[3px] hidden text-[9px] font-semibold uppercase leading-none tracking-[0.2em] text-faint sm:block">
        рынки вероятностей
      </span>
    </Link>
  );
}

/**
 * Баланс лежит в persist-хранилище: до гидратации сервер и клиент дали бы
 * разные суммы, поэтому сначала рисуем прочерк.
 */
function CashPill() {
  const cash = usePortfolioStore((s) => s.cash);
  const hydrated = useHydrated();

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3"
      title="Виртуальный баланс демо-счёта"
    >
      <span className="hidden text-[9px] font-semibold uppercase leading-none tracking-[0.14em] text-faint md:block">
        баланс
      </span>
      <span className="tnum text-[13px] font-semibold leading-none text-text">
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
    <div ref={wrapRef} className="relative shrink-0">
      <Button
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Пополнить демо-счёт"
        className="rounded-full px-2.5 sm:px-3.5"
      >
        <Plus className="size-4" />
        <span className="hidden sm:inline">Пополнить</span>
      </Button>

      {open && (
        <div className="animate-rise absolute right-0 top-12 z-50 w-64 rounded-[16px] border border-border bg-surface-raised p-3.5 shadow-pop">
          <p className="text-[13px] font-semibold text-text">
            Пополнить демо-счёт
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Кошелёк не нужен: средства виртуальные и зачисляются мгновенно.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {DEPOSIT_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(value)}
                className={cn(
                  "tnum h-9 cursor-pointer rounded-[10px] border text-[13px] font-semibold transition-colors",
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
            className="mt-3 rounded-[10px]"
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

function NavPills() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Основные разделы"
      className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 lg:flex"
    >
      {NAV_ITEMS.map((item) => {
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center rounded-full px-3.5 text-[13.5px] transition-colors",
              active
                ? "bg-bg-subtle font-semibold text-text"
                : "font-medium text-muted hover:bg-surface-hover hover:text-text",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
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
      <header className="glass sticky top-0 z-40 border-b border-border">
        <Container>
          {/* relative — центральная навигация центрируется по полосе, а не по остатку места */}
          <div className="relative flex h-16 items-center gap-2 sm:gap-3">
            <Logo />

            <NavPills />

            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Поиск рынков"
                className={cn(
                  "group flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-surface",
                  "text-[13px] text-faint transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-muted",
                  "w-9 justify-center sm:w-auto sm:justify-start sm:pl-3.5 sm:pr-2",
                )}
              >
                <Search className="size-4 shrink-0" />
                <span className="hidden sm:inline">Поиск</span>
                <kbd className="tnum hidden rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium leading-none text-faint sm:inline-block">
                  {isMac ? "⌘" : "Ctrl "}K
                </kbd>
              </button>

              <CashPill />
              <DepositButton />
              <ThemeToggle />
            </div>
          </div>
        </Container>
      </header>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
