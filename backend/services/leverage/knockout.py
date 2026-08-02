# services/leverage/knockout.py
"""
Нокаут-калькулятор плечевого слоя.

По (направление, рынок, цена входа, плечо, маржа) считает:
  - уровень нокаута (тик), где позиция гаснет;
  - размер позиции q (units);
  - макс. убыток игрока (= маржа по построению);
  - макс. выплату пула (его обязательство).

Цена — в целых тиках (0..100). Деньги ($) — производные, float.
"""
from __future__ import annotations

from dataclasses import dataclass

MAX_LEVERAGE = 5.0
ONE = 100  # $1.00 = 100 тиков

LONG = "LONG"
SHORT = "SHORT"


@dataclass(frozen=True)
class Position:
    direction: str
    market_id: str
    entry: int
    leverage: float
    margin: float
    knockout: int
    size: float
    max_loss: float
    max_payout: float


def open_position(direction: str, market_id: str, entry: int,
                  leverage: float, margin: float) -> Position:
    if direction not in (LONG, SHORT):
        raise ValueError("direction must be LONG or SHORT")
    if not (1.0 < leverage <= MAX_LEVERAGE):
        raise ValueError(f"leverage must be in (1, {MAX_LEVERAGE}]")
    if not (0 < entry < ONE):
        raise ValueError("entry must be strictly between 0 and 100 ticks")
    if margin <= 0:
        raise ValueError("margin must be positive")

    p0 = entry / ONE  # цена входа в долларах, 0..1

    if direction == LONG:
        dist = p0 / leverage
        ko_price = p0 - dist
        size = margin * leverage / p0
        max_payout = size * (1 - p0)
    else:  # SHORT
        dist = (1 - p0) / leverage
        ko_price = p0 + dist
        size = margin * leverage / (1 - p0)
        max_payout = size * p0

    knockout = round(ko_price * ONE)
    if knockout == entry:
        raise ValueError("плечо слишком велико для этого входа: нокаут совпал со входом")
    knockout = max(0, min(ONE, knockout))

    max_loss = size * dist  # по построению = margin

    return Position(
        direction=direction, market_id=market_id, entry=entry,
        leverage=leverage, margin=margin, knockout=knockout,
        size=size, max_loss=max_loss, max_payout=max_payout,
    )


def is_knocked_out(pos: Position, price: int) -> bool:
    """Позиция гаснет при касании нокаут-уровня. Сравнение целочисленное."""
    if pos.direction == LONG:
        return price <= pos.knockout
    return price >= pos.knockout