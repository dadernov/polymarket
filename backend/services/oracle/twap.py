# services/oracle/twap.py
"""
TWAP-оракул: время-взвешенная средняя цена за окно.

Идея: цена держится на уровне p от момента t0 до следующего обновления t1.
Вклад этого отрезка в среднее = p * (t1 - t0). Сумма вкладов / общее время = TWAP.
Так мгновенный шип (короткий отрезок) почти не влияет на среднее за 30 минут.

Цена — в целых тиках (0..100), как везде. Время — в секундах (float).
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass


@dataclass(frozen=True)
class Sample:
    ts: float    # временная метка, секунды
    price: int   # цена в тиках


class TWAP:
    def __init__(self, window_sec: float = 1800.0):  # 30 минут по умолчанию
        self.window = window_sec
        self.samples: deque[Sample] = deque()

    def add(self, ts: float, price: int) -> None:
        """Добавить наблюдение цены. Метки должны идти по неубыванию времени."""
        if self.samples and ts < self.samples[-1].ts:
            raise ValueError("временная метка в прошлом")
        self.samples.append(Sample(ts, price))
        self._evict(ts)

    def _evict(self, now: float) -> None:
        """Убрать наблюдения старше окна, но оставить одно «якорное» перед границей."""
        cutoff = now - self.window
        # держим одно наблюдение слева от cutoff, чтобы знать цену на начало окна
        while len(self.samples) >= 2 and self.samples[1].ts <= cutoff:
            self.samples.popleft()

    def value(self, now: float) -> int | None:
        """
        TWAP на момент now за окно [now - window, now].
        Возвращает тик (округлённо) или None, если данных нет.
        """
        if not self.samples:
            return None
        if len(self.samples) == 1:
            return self.samples[0].price  # одна точка — она и есть цена

        start = now - self.window
        weighted_sum = 0.0
        total_time = 0.0

        # идём по парам соседних наблюдений; отрезок [s.ts, nxt.ts] держит цену s.price
        pts = list(self.samples)
        for i in range(len(pts) - 1):
            s, nxt = pts[i], pts[i + 1]
            seg_start = max(s.ts, start)   # обрезаем отрезок слева границей окна
            seg_end = nxt.ts
            if seg_end <= seg_start:
                continue
            dt = seg_end - seg_start
            weighted_sum += s.price * dt
            total_time += dt

        # последний отрезок: от последнего наблюдения до now держим последнюю цену
        last = pts[-1]
        seg_start = max(last.ts, start)
        if now > seg_start:
            dt = now - seg_start
            weighted_sum += last.price * dt
            total_time += dt

        if total_time == 0:
            return last.price
        return round(weighted_sum / total_time)