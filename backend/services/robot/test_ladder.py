# services/robot/test_ladder.py
from ladder import build_ladder, best_bid, best_ask


def test_ladder_has_both_sides():
    q = build_ladder(0.60, levels=3)
    buys = [x for x in q if x.side == "BUY"]
    sells = [x for x in q if x.side == "SELL"]
    assert len(buys) == 3
    assert len(sells) == 3


def test_spread_around_fair_price():
    """При цене 0.60 и спреде 1: лучший бид 59, лучшая аска 61."""
    q = build_ladder(0.60, levels=3, spread_ticks=1)
    assert best_bid(q) == 59
    assert best_ask(q) == 61


def test_bids_below_asks():
    """Инвариант стакана: любой бид строго ниже любой аски."""
    q = build_ladder(0.60, levels=5)
    top_bid = best_bid(q)
    low_ask = best_ask(q)
    assert top_bid < low_ask


def test_levels_step_correctly():
    """Шаг 2: биды 58,56,54 (от 60-спред), с правильным интервалом."""
    q = build_ladder(0.60, levels=3, spread_ticks=2, step_ticks=2)
    bids = sorted([x.price for x in q if x.side == "BUY"], reverse=True)
    assert bids == [58, 56, 54]


def test_clamped_near_ceiling():
    """У верхней стены аски обрезаются, чтобы не котировать выше ceil=99."""
    q = build_ladder(0.985, levels=5, spread_ticks=1, step_ticks=1)
    asks = [x.price for x in q if x.side == "SELL"]
    assert all(p <= 99 for p in asks)  # ничего выше 99


def test_recenter_moves_ladder():
    """
    Перецентровка: цена сдвинулась 0.60 -> 0.70, вся лесенка уехала вверх.
    Строим заново от новой цены — это и есть механика перецентровки.
    """
    q1 = build_ladder(0.60, levels=3)
    q2 = build_ladder(0.70, levels=3)
    assert best_ask(q1) == 61
    assert best_ask(q2) == 71