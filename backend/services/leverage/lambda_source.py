# services/leverage/lambda_source.py
"""
Шов под калибровку λ/J. Тариф зависит от ИНТЕРФЕЙСА, а не от того,
откуда взялись числа. Сегодня — заглушка с данными нашего Bitcoin-рынка,
завтра — массовая калибровка из Timescale. Формула тарифа не меняется.
"""
from __future__ import annotations

from typing import Protocol


class LambdaJSource(Protocol):
    """Любой источник λ/J реализует этот метод. Тариф знает только его."""
    def lookup(self, barrier: float) -> tuple[float, float]:
        """Вернуть (λ, J) для барьера d (тиков). d — расстояние до нокаута."""
        ...


class StaticLambdaJSource:
    """
    PoC-заглушка. Числа — из нашей реальной калибровки Bitcoin-рынка
    (run_real.py). Берём ближайший откалиброванный барьер.
    Позже подменяется источником из массовой калибровки — без правки тарифа.
    """
    # барьер(тик) -> (λ, J), из прогона на живых данных
    _TABLE = {
        1.0: (0.4670, 1.384),
        2.0: (0.1930, 2.166),
        3.0: (0.1070, 2.836),
        5.0: (0.0420, 4.511),
        10.0: (0.0090, 11.217),
    }

    def lookup(self, barrier: float) -> tuple[float, float]:
        nearest = min(self._TABLE.keys(), key=lambda d: abs(d - barrier))
        return self._TABLE[nearest]