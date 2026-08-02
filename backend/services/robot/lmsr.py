from __future__ import annotations

import math
from dataclasses import dataclass

PRICE_FLOOR = 0.001  # цену держим в коридоре [0.001, 0.999]:
PRICE_CEIL = 0.999   # цена ровно 0 или 1 = робот берёт риск бесплатно
@dataclass

class LMSR:
    b: float          # глубина/риск: макс. убыток ограничен b * ln 2
    q_yes: float = 0  # всего куплено билетов ДА
    q_no: float = 0   # всего куплено билетов НЕТ

    def cost(self) -> float:
        """
        Функция стоимости C(q) = b * ln( e^(q_yes/b) + e^(q_no/b) ).

        Это «сколько денег в системе» при текущих счётчиках. Сама по себе
        абстрактна; смысл появляется в РАЗНОСТИ: цена покупки = C(после) - C(до).

        Устойчивая версия: выносим максимум за логарифм, чтобы e^x не взорвалась
        на больших q. Математически это тождество:
            ln(e^a + e^b) = m + ln(e^(a-m) + e^(b-m)),  m = max(a, b)
        """
        a1 = self.q_yes / self.b
        a2 = self.q_no / self.b
        m = max(a1, a2)
        return self.b * (m + math.log(math.exp(a1 - m) + math.exp(a2 - m)))

    def price_yes(self) -> float:
        """Мгновенная цена ДА, зажатая в коридор [PRICE_FLOOR, PRICE_CEIL]."""
        net = (self.q_yes - self.q_no) / self.b
        if net > 700:       # e^(-net) ниже float -> цена -> 1
            p = 1.0
        elif net < -700:    # e^(-net) переполнил бы float -> цена -> 0
            p = 0.0
        else:
            p = 1.0 / (1.0 + math.exp(-net))
        return min(max(p, PRICE_FLOOR), PRICE_CEIL)

    def price_no(self) -> float:
        """Цена НЕТ. По построению p_yes + p_no = 1 (наше тождество YES+NO=$1)."""
        return 1.0 - self.price_yes()

    def buy_cost(self, outcome: str, qty: float) -> float:
        """
        Сколько робот возьмёт за покупку `qty` билетов исхода `outcome`.

        Ключевая идея LMSR: цена не фиксирована, а «интегрируется» по мере покупки —
        каждый следующий билет чуть дороже предыдущего. Поэтому берём не price*qty,
        а честную разность функции стоимости: C(после покупки) - C(до).
        """
        before = self.cost()
        if outcome == "YES":
            after = LMSR(self.b, self.q_yes + qty, self.q_no).cost()
        elif outcome == "NO":
            after = LMSR(self.b, self.q_yes, self.q_no + qty).cost()
        else:
            raise ValueError("outcome must be 'YES' or 'NO'")
        return after - before

    def apply(self, outcome: str, qty: float) -> None:
        """Зафиксировать покупку: сдвинуть счётчики. После — цены пересчитаются сами."""
        if outcome == "YES":
            self.q_yes += qty
        elif outcome == "NO":
            self.q_no += qty
        else:
            raise ValueError("outcome must be 'YES' or 'NO'")

    def max_loss(self) -> float:
        """
        Верхняя граница убытка робота за всё время жизни рынка: b * ln 2.
        Не зависит от того, как торговали — только от b. Это сумма, которую
        платформа осознанно кладёт на раскрутку рынка.
        """
        return self.b * math.log(2)