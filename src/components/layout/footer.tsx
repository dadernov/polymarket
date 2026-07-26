import Link from "next/link";
import { Container } from "./container";

const LINKS = [
  { href: "/", label: "Рынки" },
  { href: "/portfolio", label: "Портфель" },
  { href: "/activity", label: "Активность" },
  { href: "/leaderboard", label: "Лидеры" },
];

export function Footer() {
  return (
    <footer className="mt-10 border-t border-border py-6">
      <Container>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-muted transition-colors hover:text-text"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="space-y-1 sm:max-w-md sm:text-right">
            <p className="text-xs leading-relaxed text-muted">
              Демонстрационный проект: баланс и позиции виртуальные, реальные
              сделки не совершаются и заработать здесь нельзя.
            </p>
            <p className="text-[11px] leading-relaxed text-faint">
              Котировки и история — публичный API Polymarket. Материалы сайта не
              являются инвестиционной рекомендацией.
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
