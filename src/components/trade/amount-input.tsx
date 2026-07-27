"use client";

/**
 * Поле размера сделки: доллары при покупке, акции при продаже.
 *
 * Подача «ledger»: подпись капителью над полем, справа на той же строке —
 * доступный остаток, само число крупной антиквой. Ввод чистится на лету,
 * поэтому в стейт панели всегда попадает строка, безопасная для parseFloat.
 */

import { cn } from "@/lib/utils";

export type AmountMode = "amount" | "shares";

export interface AmountChip {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Выделить чип как основной («Max»). */
  strong?: boolean;
}

export interface AmountInputProps {
  mode: AmountMode;
  value: string;
  onChange: (value: string) => void;
  chips?: AmountChip[];
  disabled?: boolean;
  /** Подпись капителью над полем. */
  label?: string;
  /** Правый верхний угол: доступный баланс или размер позиции. */
  hint?: string;
  invalid?: boolean;
}

const MAX_DECIMALS = 2;
const MAX_INTEGER_DIGITS = 9;

/** Только цифры и одна точка. Пустая строка допустима — это «ничего не введено». */
function sanitize(raw: string): string {
  const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [head = "", ...rest] = cleaned.split(".");
  const integer = head.slice(0, MAX_INTEGER_DIGITS);
  if (rest.length === 0) return integer;
  return `${integer}.${rest.join("").slice(0, MAX_DECIMALS)}`;
}

export function AmountInput({
  mode,
  value,
  onChange,
  chips,
  disabled = false,
  label,
  hint,
  invalid = false,
}: AmountInputProps) {
  const empty = value.length === 0;
  const isMoney = mode === "amount";

  // Подпись поля видна глазами, но не скринридеру: у поля своя роль в форме,
  // и «Маржа» должна попадать в его имя, а не только в капитель над ним.
  const ariaLabel = label
    ? `${label}${isMoney ? " в долларах" : ", акций"}`
    : isMoney
      ? "Сумма в долларах"
      : "Количество акций";

  return (
    <div>
      {(label || hint) && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          {label && (
            <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
              {label}
            </span>
          )}
          {hint && <span className="tnum text-[11px] text-muted">{hint}</span>}
        </div>
      )}

      <div
        className={cn(
          "flex items-baseline gap-1 rounded-[14px] border bg-bg-subtle px-4 py-3 transition-colors",
          invalid
            ? "border-no"
            : "border-border focus-within:border-accent/45",
          disabled && "opacity-55",
        )}
      >
        {isMoney && (
          <span
            className={cn(
              "display shrink-0 text-[26px] leading-none",
              empty ? "text-faint" : "text-muted",
            )}
          >
            $
          </span>
        )}

        {/* Невидимый двойник задаёт полю ширину по содержимому: знак доллара и
            подпись «акц.» остаются приклеенными к числу при любой его длине. */}
        <span className="grid min-w-0 max-w-full">
          <span
            aria-hidden
            className="display tnum invisible col-start-1 row-start-1 whitespace-pre px-px text-[30px] leading-none"
          >
            {value || "0"}
          </span>
          <input
            type="text"
            inputMode="decimal"
            // size=1 убирает собственную ширину поля — её задаёт двойник выше.
            size={1}
            autoComplete="off"
            spellCheck={false}
            placeholder="0"
            value={value}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={(event) => onChange(sanitize(event.target.value))}
            className={cn(
              "display tnum col-start-1 row-start-1 w-full min-w-0 bg-transparent px-px",
              "text-[30px] leading-none text-text outline-none placeholder:text-faint",
            )}
          />
        </span>

        {!isMoney && (
          <span className="shrink-0 text-[11px] font-medium text-faint">акц.</span>
        )}
      </div>

      {chips && chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={disabled || chip.disabled}
              onClick={chip.onClick}
              className={cn(
                "tnum cursor-pointer rounded-[10px] border px-2.5 py-1 text-[11.5px] font-medium",
                "transition-colors disabled:pointer-events-none disabled:opacity-45",
                chip.strong
                  ? "border-transparent bg-accent-soft text-accent hover:bg-accent hover:text-white"
                  : "border-border text-muted hover:border-border-strong hover:text-text",
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
