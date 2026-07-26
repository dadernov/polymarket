"use client";

import { Gauge, Plus, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

function toneClass(value: number): string {
  if (value > 0) return "text-yes";
  if (value < 0) return "text-no";
  return "text-text";
}

function Tile({
  label,
  value,
  sub,
  valueClass,
  loading,
}: {
  label: string;
  value: string;
  sub: ReactNode;
  valueClass?: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-border-strong">
      <p className="text-[11px] font-medium uppercase tracking-wide text-faint">
        {label}
      </p>
      {loading ? (
        <>
          <Skeleton className="mt-2 h-6 w-24" />
          <Skeleton className="mt-2 h-3 w-16" />
        </>
      ) : (
        <>
          <p className={cn("tnum mt-1.5 text-xl font-semibold", valueClass)}>
            {value}
          </p>
          <p className="tnum mt-0.5 text-[11px] text-muted">{sub}</p>
        </>
      )}
    </div>
  );
}

/** Пара «подпись — число» в полоске плеча. */
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted">{label}</span>
      <span className={cn("tnum font-semibold text-text", tone)}>{value}</span>
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

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          loading={!ready}
          label="Стоимость портфеля"
          value={formatMoney(equity)}
          sub={
            hasLeverage
              ? `Позиции ${formatMoney(totals.value)} · плечо ${formatMoney(leverage.value)}`
              : `Позиции ${formatMoney(totals.value)}`
          }
        />
        <Tile
          loading={!ready}
          label="Кэш"
          value={formatMoney(cash)}
          sub={
            leverage.margin > 0
              ? `Ещё ${formatMoney(leverage.margin)} в марже`
              : "Свободно для сделок"
          }
        />
        <Tile
          loading={!ready}
          label="Нереализованный P&L"
          value={formatSignedMoney(unrealized)}
          valueClass={toneClass(unrealized)}
          sub={`${formatPercent(returnPct)} к вложенному`}
        />
        <Tile
          loading={!ready}
          label="Реализованный P&L"
          value={formatSignedMoney(realizedTotal)}
          valueClass={toneClass(realizedTotal)}
          sub={`Сделок: ${hydrated ? fillsCount : 0}`}
        />
      </div>

      {ready && hasLeverage && (
        <div className="animate-fade-in flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-text">
            <Gauge className="size-3.5 text-muted" aria-hidden />
            Плечо
          </span>
          <Stat label="Экспозиция" value={formatMoney(leverage.exposure)} />
          <Stat label="Маржа" value={formatMoney(leverage.margin)} />
          <Stat
            label="P&L"
            value={formatSignedMoney(leverage.unrealized)}
            tone={toneClass(leverage.unrealized)}
          />
          <span className="tnum ml-auto text-muted">
            {leverage.open} откр.
            {leverage.knockedOut > 0
              ? ` · ${leverage.knockedOut} сгорело на ${formatMoney(leverage.knockedOutMargin)}`
              : ""}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="rounded-xl"
          onClick={() => deposit(DEPOSIT_AMOUNT)}
        >
          <Plus className="size-4" />
          Пополнить на {formatMoney(DEPOSIT_AMOUNT, 0)}
        </Button>

        {confirming ? (
          <div className="animate-fade-in flex items-center gap-1.5">
            <span className="text-xs text-muted">Стереть позиции, плечо и историю?</span>
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
            Сбросить портфель
          </Button>
        )}
      </div>
    </section>
  );
}
