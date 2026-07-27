import Link from "next/link";
import { Container } from "./container";

const LINKS = [
  { href: "/", label: "Рынки" },
  { href: "/markets", label: "Все рынки" },
  { href: "/portfolio", label: "Портфель" },
  { href: "/activity", label: "Активность" },
  { href: "/leaderboard", label: "Лидеры" },
];

/**
 * Три правила из прежнего сайдбара: без них новичок не понимает, что цена
 * и вероятность — одно и то же число.
 */
const BASICS = [
  "Цена исхода — его вероятность: 62¢ означают 62%.",
  "Верный исход гасится по $1, остальные — по $0.",
  "Условия резолва — во вкладке «Правила» на странице события.",
];

export function Footer() {
  return (
    <footer className="mt-16">
      <Container>
        <div className="rule h-px" />

        <div className="grid gap-8 py-8 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
          <div className="max-w-lg">
            <p className="display text-[21px] leading-none text-text">
              Кворум<span className="text-accent">.</span>
            </p>
            <p className="mt-1.5 text-[9px] font-semibold uppercase leading-none tracking-[0.2em] text-faint">
              рынки вероятностей
            </p>

            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
              как это читать
            </p>
            <ul className="mt-2.5 space-y-2">
              {BASICS.map((line, i) => (
                <li
                  key={line}
                  className="flex gap-2.5 text-[13px] leading-relaxed text-muted"
                >
                  <span className="tnum mt-px shrink-0 text-[10px] font-semibold leading-relaxed tracking-wider text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <nav className="flex flex-col gap-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
              разделы
            </p>
            {LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-[13px] text-muted transition-colors hover:text-text"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="rule h-px" />

        <div className="flex flex-col gap-1.5 py-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
          <p className="text-[11px] leading-relaxed text-faint">
            Демо-режим: баланс и позиции виртуальные, сделки не исполняются на
            реальном рынке.
          </p>
          <p className="text-[11px] leading-relaxed text-faint sm:max-w-sm sm:text-right">
            Котировки, графики и история сделок — публичные API Polymarket.
            Материалы сайта не являются инвестиционной рекомендацией.
          </p>
        </div>
      </Container>
    </footer>
  );
}
