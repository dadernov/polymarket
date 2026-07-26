"use client";

/**
 * Крупное поле размера сделки: доллары при покупке, акции при продаже.
 * Ввод чистится на лету, поэтому в стейт панели всегда попадает строка,
 * которую безопасно скормить parseFloat.
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AmountMode = "amount" | "shares";

export interface AmountChip {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface AmountInputProps {
  mode: AmountMode;
  value: string;
  onChange: (value: string) => void;
  chips?: AmountChip[];
  disabled?: boolean;
  /** Подпись слева внутри поля. */
  label?: string;
  /** Строка под полем: доступный баланс или размер позиции. */
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

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border bg-bg-subtle px-3 py-2.5 transition-colors",
          invalid
            ? "border-no"
            : "border-border focus-within:border-border-strong",
          disabled && "opacity-60",
        )}
      >
        {label && (
          <span className="shrink-0 text-xs font-medium text-muted">{label}</span>
        )}

        <div className="flex min-w-0 flex-1 items-baseline justify-end gap-1">
          {isMoney && (
            <span
              className={cn(
                "text-2xl font-semibold leading-none",
                empty ? "text-faint" : "text-text",
              )}
            >
              $
            </span>
          )}

          {/* Невидимый двойник задаёт полю ширину по содержимому: знак доллара
              остаётся приклеенным к числу, а вся группа прижата вправо. */}
          <span className="grid min-w-0 max-w-full">
            <span
              aria-hidden
              className="tnum invisible col-start-1 row-start-1 whitespace-pre px-px text-2xl font-semibold leading-none"
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
              aria-label={isMoney ? "Сумма в долларах" : "Количество акций"}
              onChange={(event) => onChange(sanitize(event.target.value))}
              className={cn(
                "tnum col-start-1 row-start-1 w-full min-w-0 bg-transparent px-px",
                "text-right text-2xl font-semibold leading-none text-text outline-none",
                "placeholder:text-faint",
              )}
            />
          </span>

          {!isMoney && (
            <span className="shrink-0 text-xs font-medium text-faint">акц.</span>
          )}
        </div>
      </div>

      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <Button
              key={chip.label}
              type="button"
              variant="secondary"
              size="xs"
              disabled={disabled || chip.disabled}
              onClick={chip.onClick}
              className="tnum"
            >
              {chip.label}
            </Button>
          ))}
        </div>
      )}

      {hint && <p className="tnum text-right text-xs text-faint">{hint}</p>}
    </div>
  );
}
