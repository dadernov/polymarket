"use client";

import { Plus, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatPercent, formatSignedMoney } from "@/lib/format";
import { portfolioTotals, useHydrated, usePortfolioStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Разовое пополнение демо-счёта. */
const DEPOSIT_AMOUNT = 1000;

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

export function PortfolioSummary({ marks }: { marks: Record<string, number> }) {
  const positions = usePortfolioStore((s) => s.positions);
  const cash = usePortfolioStore((s) => s.cash);
  const realized = usePortfolioStore((s) => s.realized);
  const fillsCount = usePortfolioStore((s) => s.fills.length);
  const deposit = usePortfolioStore((s) => s.deposit);
  const resetAll = usePortfolioStore((s) => s.resetAll);
  const hydrated = useHydrated();

  const [confirming, setConfirming] = useState(false);

  const totals = portfolioTotals(positions, marks);
  const equity = cash + totals.value;
  const returnPct = totals.invested > 0 ? totals.unrealized / totals.invested : 0;

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          loading={!hydrated}
          label="Стоимость портфеля"
          value={formatMoney(equity)}
          sub={`Позиции ${formatMoney(totals.value)}`}
        />
        <Tile
          loading={!hydrated}
          label="Кэш"
          value={formatMoney(cash)}
          sub="Свободно для сделок"
        />
        <Tile
          loading={!hydrated}
          label="Нереализованный P&L"
          value={formatSignedMoney(totals.unrealized)}
          valueClass={toneClass(totals.unrealized)}
          sub={`${formatPercent(returnPct)} к вложенному`}
        />
        <Tile
          loading={!hydrated}
          label="Реализованный P&L"
          value={formatSignedMoney(realized)}
          valueClass={toneClass(realized)}
          sub={`Сделок: ${hydrated ? fillsCount : 0}`}
        />
      </div>

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
            <span className="text-xs text-muted">Стереть позиции и историю?</span>
            <Button
              size="xs"
              variant="danger"
              onClick={() => {
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
