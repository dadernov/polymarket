# services/leverage/tariff.py
"""
Тарифный модуль: цена за риск плечевой позиции.

  тариф = стоимость капитала + гэп-премия(λ·J·запас) + маржа платформы

Все три — в долях от маржи игрока. λ/J приходят через LambdaJSource (шов).
"""
from __future__ import annotations

from dataclasses import dataclass

from knockout import Position
from lambda_source import LambdaJSource


@dataclass(frozen=True)
class TariffConfig:
    capital_rate: float = 0.02      # стоимость капитала: доля от обязательства пула
    platform_fee: float = 0.015     # маржа платформы: доля от маржи
    gap_buffer: float = 1.5         # запас поверх λ·J (неопределённость)
    tick_value: float = 0.01        # $ за 1 тик (1 тик = $0.01)


@dataclass(frozen=True)
class TariffBreakdown:
    capital_cost: float   # $ за замороженный капитал
    gap_premium: float    # $ ожидаемого убытка от прыжков + запас
    platform_cost: float  # $ заработок платформы
    total: float          # $ итого с игрока
    total_pct: float      # % от маржи

    def as_dict(self) -> dict:
        return {
            "capital_cost": round(self.capital_cost, 4),
            "gap_premium": round(self.gap_premium, 4),
            "platform_cost": round(self.platform_cost, 4),
            "total": round(self.total, 4),
            "total_pct": round(self.total_pct, 2),
        }


def barrier_ticks(pos: Position) -> float:
    """Расстояние от входа до нокаута в тиках — это d для калибровки λ/J."""
    return abs(pos.entry - pos.knockout)


def price_position(pos: Position, source: LambdaJSource,
                   cfg: TariffConfig = TariffConfig()) -> TariffBreakdown:
    """Собрать тариф из трёх слагаемых для конкретной позиции."""
    # 1) стоимость капитала: пул морозит обязательство (max_payout)
    capital_cost = pos.max_payout * cfg.capital_rate

    # 2) гэп-премия: λ·J на нокаут-барьере, в $, с запасом.
    #    λ·J — ожидаемый перелёт в тиках на позицию -> в $ через размер и tick_value.
    d = barrier_ticks(pos)
    lam, j = source.lookup(d)
    expected_overshoot_ticks = lam * j            # ожидаемый перелёт, тиков
    gap_premium = (expected_overshoot_ticks * cfg.tick_value
                   * pos.size * cfg.gap_buffer)   # -> $, масштаб позиции, с запасом

    # 3) маржа платформы: доля от маржи игрока
    platform_cost = pos.margin * cfg.platform_fee

    total = capital_cost + gap_premium + platform_cost
    total_pct = total / pos.margin * 100.0

    return TariffBreakdown(
        capital_cost=capital_cost, gap_premium=gap_premium,
        platform_cost=platform_cost, total=total, total_pct=total_pct,
    )