"use client";

import { Gauge, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Stat } from "@/components/ui/stat";
import { formatMoney, formatPercent, formatSignedMoney } from "@/lib/format";
import {
  leverageTotals,
  portfolioTotals,
  useHydrated,
  useLeverageHydrated,
  useLeverageStore,
  usePortfolioStore,
  type LeveragePosition,
} from "@/lib/store";
import { cn } from "@/lib/utils";

/** Разовое пополнение демо-счёта. */
const DEPOSIT_AMOUNT = 1000;

/** Стабильная пустышка: до гидратации показывать сохранённое нельзя. */
const NO_LEVERAGE: Record<string, LeveragePosition> = {};

/** До гидратации вместо цифр — прочерк: иначе сервер и клиент разойдутся. */
const DASH = "—";

type Tone = "neutral" | "yes" | "no" | "accent";

function toneOf(value: number): Tone {
  if (value > 0) return "yes";
  if (value < 0) return "no";
  return "neutral";
}

function toneClass(value: number): string {
  if (value > 0) return "text-yes";
  if (value < 0) return "text-no";
  return "text-text";
}

/** Пара «подпись — число» в полоске плеча. */
function Pair({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted">{label}</span>
      <span className={cn("tnum font-semibold text-text", className)}>{value}</span>
    </span>
  );
}

export function PortfolioSummary({ marks }: { marks: Record<string, number> }) {
  const positions = usePortfolioStore((s) => s.positions);
  const cash = usePortfolioStore((s) => s.cash);
  const realized = usePortfolioStore((s) => s.realized);
  const fillsCount = usePortfolioStore((s) => s.fills.length);
  const deposit = usePortfolioStore((s) => s.deposit);
  const resetAll = usePortfolioStore((s) => s.resetAll);
  const hydrated = useHydrated();

  const leverageMap = useLeverageStore((s) => s.positions);
  const leverageRealized = useLeverageStore((s) => s.realized);
  const resetLeverage = useLeverageStore((s) => s.resetAll);
  const leverageHydrated = useLeverageHydrated();

  const [confirming, setConfirming] = useState(false);

  // Хранилища поднимаются независимо: пока не готовы оба, цифры складывать
  // нельзя — получится портфель без плеча, а потом скачок.
  const ready = hydrated && leverageHydrated;

  const totals = portfolioTotals(positions, marks);
  const leverage = leverageTotals(leverageHydrated ? leverageMap : NO_LEVERAGE, marks);
  const hasLeverage = leverage.open > 0 || leverage.knockedOut > 0;

  // Маржа уже списана из кошелька при открытии позиции, поэтому в стоимость
  // портфеля она входит ровно один раз — внутри `leverage.value` (маржа + P&L).
  const equity = cash + totals.value + leverage.value;

  const unrealized = totals.unrealized + leverage.unrealized;
  const invested = totals.invested + leverage.margin;
  const returnPct = invested > 0 ? unrealized / invested : 0;
  const realizedTotal = realized + (leverageHydrated ? leverageRealized : 0);

  const money = (value: number) => (ready ? formatMoney(value) : DASH);
  const signed = (value: number) => (ready ? formatSignedMoney(value) : DASH);

  return (
    <section className="card p-5 sm:p-6">
      {/* Главное число экрана — стоимость счёта. Всё остальное объясняет,
          из чего она сложилась, поэтому стоит строкой ниже и мельче. */}
      <div className="rule flex flex-wrap items-start justify-between gap-x-8 gap-y-4 pb-5">
        <div className="min-w-0">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">
            Стоимость портфеля
          </p>
          <p className="display tnum mt-2 text-[38px] leading-none text-text sm:text-[44px]">
            {money(equity)}
          </p>
          <p className="tnum mt-2.5 text-[12.5px] leading-relaxed text-muted">
            {ready ? (
              <>
                Позиции {formatMoney(totals.value)} · свободно {formatMoney(cash)}
                {hasLeverage ? ` · плечо ${formatMoney(leverage.value)}` : ""}
              </>
            ) : (
              "Читаем локальный счёт…"
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => deposit(DEPOSIT_AMOUNT)}
          >
            <Plus className="size-4" />
            Пополнить на {formatMoney(DEPOSIT_AMOUNT, 0)}
          </Button>

          {confirming ? (
            <div className="animate-fade-in flex items-center gap-1.5">
              <span className="text-[11.5px] text-muted">
                Стереть позиции, плечо и историю?
              </span>
              <Button
                size="xs"
                variant="danger"
                onClick={() => {
                  // Кошелёк общий: оставить плечевые позиции после сброса счёта
                  // значило бы вернуть маржу дважды.
                  resetLeverage();
                  resetAll();
                  setConfirming(false);
                }}
              >
                Сбросить
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
                Отмена
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              <RotateCcw className="size-3.5" />
              Сбросить
            </Button>
          )}
        </div>
      </div>

      {/* Показатели в ряд с разделителями. <StatRow/> здесь не подходит: он не
          переносит строки, а на телефоне четыре показателя идут сеткой 2×2. */}
      <div
        className={cn(
          "mt-5 grid grid-cols-2 gap-x-6 gap-y-5",
          "sm:grid-cols-4 sm:gap-x-5",
          "sm:[&>*+*]:border-l sm:[&>*+*]:border-border sm:[&>*+*]:pl-5",
        )}
      >
        <Stat
          label="Свободные деньги"
          value={money(cash)}
          hint={
            leverage.margin > 0
              ? `Ещё ${formatMoney(leverage.margin)} держит маржа`
              : "Готовы к сделкам"
          }
        />
        <Stat
          label="Нереализовано"
          value={signed(unrealized)}
          tone={ready ? toneOf(unrealized) : "neutral"}
          hint={ready ? `${formatPercent(returnPct)} к вложенному` : "по открытым позициям"}
        />
        <Stat
          label="Реализовано"
          value={signed(realizedTotal)}
          tone={ready ? toneOf(realizedTotal) : "neutral"}
          hint={`Сделок: ${hydrated ? fillsCount : 0}`}
        />
        <Stat
          label="Экспозиция плеча"
          value={money(leverage.exposure)}
          hint={
            ready && leverage.open > 0
              ? `${leverage.open} открыто · маржа ${formatMoney(leverage.margin)}`
              : "Плечевых позиций нет"
          }
        />
      </div>

      {ready && hasLeverage && (
        <div className="animate-fade-in mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[12px] bg-bg-subtle px-3.5 py-3 text-[12px]">
          <span className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
            <Gauge className="size-3.5" aria-hidden />
            Плечо
            {/* Регистр и трекинг капители внутрь подсказки не наследуем. */}
            <Hint className="normal-case tracking-normal">
              Экспозиция — маржа, умноженная на плечо: столько денег работает на
              рынке. Потерять можно только маржу: на нокаут-цене позиция
              закрывается автоматически.
            </Hint>
          </span>
          <Pair label="Маржа" value={formatMoney(leverage.margin)} />
          <Pair label="Заёмное" value={formatMoney(leverage.borrowed)} />
          <Pair
            label="P&L"
            value={formatSignedMoney(leverage.unrealized)}
            className={toneClass(leverage.unrealized)}
          />
          <span className="tnum ml-auto text-faint">
            {leverage.open} откр.
            {leverage.knockedOut > 0
              ? ` · ${leverage.knockedOut} сгорело на ${formatMoney(leverage.knockedOutMargin)}`
              : ""}
          </span>
        </div>
      )}
    </section>
  );
}
