# services/pipeline/calibrate.py
"""
Калибровка λ(d) и J(d) по ценовому ряду.

λ(d) — доля пошаговых изменений, пробивших барьер d.
J(d) — средний перелёт за барьер среди пробивших.
gap_premium(d) = λ(d) * J(d) — ожидаемый убыток пула на позицию от прыжков.

Работает и на синтетике, и на реальной истории — источник ряда неважен.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class CalibPoint:
    barrier: float   # d, расстояние до нокаута в тиках
    lam: float       # λ(d): частота пробоев (доля шагов)
    overshoot: float # J(d): средний перелёт за барьер
    premium: float   # λ * J: ожидаемый убыток на позицию


def estimate_lambda(changes: np.ndarray, barrier: float) -> float:
    """Доля шагов, где |Δ| >= barrier. Это и есть частота пробоя барьера."""
    return float(np.mean(changes >= barrier))


def estimate_overshoot(changes: np.ndarray, barrier: float) -> float:
    """
    Средний перелёт за барьер: mean(|Δ| - barrier) по шагам, что его пробили.
    Если пробоев не было — перелёта нет, возвращаем 0.
    """
    breaches = changes[changes >= barrier]
    if breaches.size == 0:
        return 0.0
    return float(np.mean(breaches - barrier))


def build_table(changes: np.ndarray, barriers: list[float]) -> list[CalibPoint]:
    """Пройти по набору барьеров и собрать таблицу λ/J/премии для каждого."""
    table = []
    for d in barriers:
        lam = estimate_lambda(changes, d)
        j = estimate_overshoot(changes, d)
        table.append(CalibPoint(barrier=d, lam=lam, overshoot=j, premium=lam * j))
    return table


def barrier_for_leverage(market_width: float, leverage: float) -> float:
    """
    Грубая связь плеча и барьера: чем выше плечо, тем ближе нокаут.
    market_width — характерный размах цены рынка (тики). Точную форму
    уточним в плечевом слое; здесь фиксируем обратную пропорцию.
    """
    return market_width / leverage

def load_csv(path: str) -> np.ndarray:
    """
    Загрузить ряд цен из CSV (колонки timestamp, price).
    Polymarket отдаёт цену как вероятность 0..1 -> переводим в тики 0..100,
    чтобы шкала совпадала с синтетикой и барьеры были сопоставимы.
    """
    import csv

    prices = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            prices.append(float(row["price"]) * 100.0)  # вероятность -> тики
    return np.array(prices)