# services/leverage/pool_risk.py
"""
Риск-движок пула: неттинг лонг/шорт и лимиты на приём позиций.

Лимиты — в терминах МАКСИМАЛЬНОЙ ВЫПЛАТЫ (обязательства пула), не номинала.
Три уровня: на рынок, на кластер коррелированных рынков, на весь пул.

Off-chain-логика "предлагает"; в контракте эти лимиты станут инвариантами.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from knockout import Position, LONG, SHORT


@dataclass(frozen=True)
class PoolLimits:
    capital: float               # весь капитал пула, $
    per_market: float = 0.03     # ≤3% капитала на один рынок
    per_cluster: float = 0.10    # ≤10% на кластер коррелированных рынков
    global_stress: float = 0.30  # ≤30% суммарно по всему пулу


@dataclass
class Exposure:
    """Обязательства пула по одному рынку, разбитые на лонг/шорт."""
    long_payout: float = 0.0   # сумма max_payout лонгов
    short_payout: float = 0.0  # сумма max_payout шортов

    @property
    def net(self) -> float:
        """Чистый перекос = |лонги − шорты|. Это и есть риск пула по рынку."""
        return abs(self.long_payout - self.short_payout)


class PoolRiskEngine:
    def __init__(self, limits: PoolLimits, clusters: dict[str, str] | None = None):
        self.limits = limits
        # market_id -> cluster_id (какие рынки коррелируют). Нет записи -> сам себе кластер.
        self.clusters = clusters or {}
        self.exposure: dict[str, Exposure] = {}

    def _cluster_of(self, market_id: str) -> str:
        return self.clusters.get(market_id, market_id)

    def _with_added(self, pos: Position) -> Exposure:
        """Копия экспозиции рынка с добавленной позицией — для проверки ДО принятия."""
        cur = self.exposure.get(pos.market_id, Exposure())
        new = Exposure(cur.long_payout, cur.short_payout)
        if pos.direction == LONG:
            new.long_payout += pos.max_payout
        else:
            new.short_payout += pos.max_payout
        return new

    def net_cluster(self, cluster_id: str, override: dict[str, Exposure] | None = None) -> float:
        """Суммарный чистый риск по кластеру (сумма перекосов его рынков)."""
        table = {**self.exposure, **(override or {})}
        total = 0.0
        for mid, exp in table.items():
            if self._cluster_of(mid) == cluster_id:
                total += exp.net
        return total

    def net_global(self, override: dict[str, Exposure] | None = None) -> float:
        """Суммарный чистый риск по всему пулу."""
        table = {**self.exposure, **(override or {})}
        return sum(exp.net for exp in table.values())

    def can_accept(self, pos: Position) -> tuple[bool, str]:
        """
        Проверить, можно ли принять позицию, НЕ меняя состояние.
        Возвращает (можно?, причина_отказа). Проверяет все три лимита.
        """
        trial = self._with_added(pos)
        override = {pos.market_id: trial}

        # 1) лимит на рынок
        cap = self.limits.capital
        if trial.net > cap * self.limits.per_market:
            return False, f"per_market: перекос {trial.net:.0f} > лимит {cap*self.limits.per_market:.0f}"

        # 2) лимит на кластер
        cluster = self._cluster_of(pos.market_id)
        if self.net_cluster(cluster, override) > cap * self.limits.per_cluster:
            return False, "per_cluster: превышен лимит кластера"

        # 3) глобальный лимит
        if self.net_global(override) > cap * self.limits.global_stress:
            return False, "global_stress: превышен глобальный лимит"

        return True, "ok"

    def accept(self, pos: Position) -> None:
        """Принять позицию — обновить экспозицию рынка. Зовётся ПОСЛЕ can_accept."""
        ok, reason = self.can_accept(pos)
        if not ok:
            raise ValueError(f"позиция отклонена: {reason}")
        cur = self.exposure.get(pos.market_id, Exposure())
        if pos.direction == LONG:
            cur.long_payout += pos.max_payout
        else:
            cur.short_payout += pos.max_payout
        self.exposure[pos.market_id] = cur