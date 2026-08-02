# services/robot/test_lmsr.py
import math

import pytest

from lmsr import LMSR


def test_prices_sum_to_one():
    """Тождество YES+NO=$1 встроено в формулу — при любых счётчиках."""
    m = LMSR(b=40, q_yes=137, q_no=52)
    assert m.price_yes() + m.price_no() == pytest.approx(1.0)


def test_prices_in_open_interval():
    """Цена всегда строго между 0 и 1, даже при сильном перекосе."""
    m = LMSR(b=40, q_yes=100000, q_no=0)
    assert 0.0 < m.price_yes() < 1.0
    assert 0.0 < m.price_no() < 1.0


def test_empty_market_is_fair_50_50():
    """Пустой рынок: никто ничего не купил -> честные 50/50."""
    m = LMSR(b=40)
    assert m.price_yes() == pytest.approx(0.5)


def test_buying_yes_pushes_price_up():
    """Спрос двигает цену: купили ДА -> ДА подорожал."""
    m = LMSR(b=40)
    p_before = m.price_yes()
    m.apply("YES", 50)
    assert m.price_yes() > p_before


def test_buy_cost_exceeds_naive_price_times_qty():
    """
    Крупная покупка стоит ДОРОЖЕ, чем цена * объём: цена растёт в процессе.
    Это и отличает LMSR от простого прайслиста.
    """
    m = LMSR(b=40)
    naive = m.price_yes() * 100        # если бы цена не двигалась
    real = m.buy_cost("YES", 100)      # честная стоимость через интеграл
    assert real > naive


def test_loss_bounded_by_b_ln2():
    """
    Худший случай для робота: рынок ушёл в один исход целиком.
    Убыток = выплата победителям - собранные деньги; он не превышает b*ln2.
    """
    b = 40
    m = LMSR(b=b)
    # трейдеры выкупают ДА огромным объёмом
    qty = 100000
    collected = m.buy_cost("YES", qty)  # сколько робот получил
    m.apply("YES", qty)
    # рынок разрешился в ДА: робот должен выплатить по $1 за каждый билет ДА
    payout = qty
    loss = payout - collected
    assert loss <= m.max_loss() + 1e-6
    assert loss == pytest.approx(b * math.log(2), rel=0.02)