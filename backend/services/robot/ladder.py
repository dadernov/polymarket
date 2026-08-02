# services/robot/ladder.py
"""
Лесенка заявок робота: из одной справедливой цены LMSR строим набор
бидов (чуть ниже) и асков (чуть выше) — глубину с обеих сторон.

Чистая логика расстановки: ни сети, ни стакана. Цены — в тиках (1 тик = $0.01),
как в матчере: целые от 0 до 100. Так исключаем float в деньгах.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Quote:
    side: str    # "BUY" (бид) или "SELL" (аск)
    price: int   # цена в тиках, 0..100
    qty: int     # объём билетов на этом уровне


def build_ladder(
    fair_price: float,   # справедливая цена ДА из LMSR, напр. 0.60
    levels: int = 3,     # сколько уровней с КАЖДОЙ стороны (ТЗ: 3–5)
    spread_ticks: int = 1,   # отступ первого уровня от справедливой цены
    step_ticks: int = 1,     # шаг между уровнями
    qty_per_level: int = 100,
    floor: int = 1,      # не котируем у самых стен (см. коридор цен LMSR)
    ceil: int = 99,
) -> list[Quote]:
    """
    Возвращает лесенку заявок вокруг fair_price.

    Биды идут ВНИЗ от (цена - спред): цена-1, цена-2, ...
    Аски идут ВВЕРХ от (цена + спред): цена+1, цена+2, ...
    Цены зажаты в [floor, ceil], чтобы не котировать у самых 0 и 100.
    """
    center = round(fair_price * 100)  # 0.60 -> тик 60
    quotes: list[Quote] = []

    # биды: чуть ниже справедливой цены, ступеньками вниз
    for i in range(levels):
        p = center - spread_ticks - i * step_ticks
        if p < floor:
            break  # ниже пола не котируем
        quotes.append(Quote(side="BUY", price=p, qty=qty_per_level))

    # аски: чуть выше справедливой цены, ступеньками вверх
    for i in range(levels):
        p = center + spread_ticks + i * step_ticks
        if p > ceil:
            break
        quotes.append(Quote(side="SELL", price=p, qty=qty_per_level))

    return quotes


def best_bid(quotes: list[Quote]) -> int | None:
    """Лучший (самый высокий) бид — по нему пользователь продаёт роботу."""
    bids = [q.price for q in quotes if q.side == "BUY"]
    return max(bids) if bids else None


def best_ask(quotes: list[Quote]) -> int | None:
    """Лучшая (самая низкая) аска — по ней пользователь покупает у робота."""
    asks = [q.price for q in quotes if q.side == "SELL"]
    return min(asks) if asks else None