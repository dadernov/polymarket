"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LayoutGrid, Lightbulb, Star, Trophy, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useWatchlistHydrated, useWatchlistStore } from "@/lib/store";
import { cn } from "@/lib/utils";
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

export function Logo({
  className,
  /** На узких экранах оставляем только знак — в шапке иначе не хватает места. */
  compactLabel = false,
}: {
  className?: string;
  compactLabel?: boolean;
}) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2 transition-opacity hover:opacity-80",
        className,
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent">
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path
            d="M4 15.5 9.5 9l4 4.5L20 6"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="20" cy="6" r="2.4" fill="white" />
        </svg>
      </span>
      <span
        className={cn(
          "text-[15px] font-bold tracking-tight text-text",
          compactLabel && "hidden sm:inline",
        )}
      >
        Polymarket
      </span>
    </Link>
  );
}

const FOOTER_LINKS = [
  { href: "/markets", label: "Все рынки" },
  { href: "/?tag=all", label: "Все категории" },
];

/** Короткая справка вместо отдельной страницы: три правила, которых хватает новичку. */
const BASICS = [
  "Цена исхода — его вероятность: 62¢ означают 62%.",
  "Верный исход гасится по $1, остальные — по $0.",
  "Условия резолва — во вкладке «Правила» на странице события.",
];

function HowItWorks() {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-text">
        <Lightbulb className="size-3.5 text-accent" aria-hidden />
        Как это работает
      </p>
      <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-muted">
        {BASICS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-2 border-t border-border pt-2 text-[11px] leading-relaxed text-faint">
        Демо-версия: баланс и позиции виртуальные, реальные сделки не проходят.
      </p>
    </div>
  );
}

/** Блок «Избранное»: счётчик появляется только после гидратации стора. */
function WatchlistHint() {
  const count = useWatchlistStore((s) => s.slugs.length);
  const hydrated = useWatchlistHydrated();
  const saved = hydrated ? count : 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-text">
        <Star className="size-3.5 text-accent" />
        Избранное
        {saved > 0 && (
          <span className="tnum ml-auto rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
            {saved}
          </span>
        )}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
        {saved > 0
          ? "Отмеченные события всегда под рукой — ищите звёздочку на карточке."
          : "Отмечайте события звёздочкой — быстрый доступ к ним появится здесь."}
      </p>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-[232px] flex-col border-r border-border bg-bg lg:flex">
      <div className="flex h-14 shrink-0 items-center px-5">
        <Logo />
      </div>

      <nav className="flex flex-col gap-0.5 px-3 pb-2 pt-1">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2",
                "text-sm font-medium transition-colors",
                active
                  ? "bg-surface-hover text-text"
                  : "text-muted hover:bg-surface hover:text-text",
              )}
            >
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent transition-opacity",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
              <item.icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  active ? "text-accent" : "text-faint group-hover:text-muted",
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 my-2 h-px bg-border" />

      <div className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-2">
        <WatchlistHint />
        <HowItWorks />
      </div>

      <div className="mt-auto px-3 pb-4">
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 px-3">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-[11px] text-faint transition-colors hover:text-muted"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <ThemeToggle withLabel />
      </div>
    </aside>
  );
}
