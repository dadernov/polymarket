import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Обёртка нужна только ради метаданных: сама страница портфеля клиентская
 * (читает локальное хранилище позиций), а из «use client»-модуля экспорт
 * `metadata` не работает — вкладка оставалась с общим заголовком сайта.
 */
export const metadata: Metadata = {
  title: "Портфель",
  description:
    "Позиции, история сделок и накопленный результат демо-счёта: деньги виртуальные, котировки и переоценка — настоящие.",
  robots: { index: false, follow: true },
};

export default function PortfolioLayout({ children }: { children: ReactNode }) {
  return children;
}
