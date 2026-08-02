# services/leverage/test_tariff.py
import pytest

from knockout import open_position, LONG, SHORT
from lambda_source import StaticLambdaJSource
from tariff import price_position, barrier_ticks, TariffConfig


SRC = StaticLambdaJSource()


def test_breakdown_sums_to_total():
    pos = open_position(LONG, "btc", entry=50, leverage=5, margin=100)
    b = price_position(pos, SRC)
    assert b.total == pytest.approx(b.capital_cost + b.gap_premium + b.platform_cost)


def test_higher_leverage_costs_more():
    lo = price_position(open_position(LONG, "btc", 50, 2, 100), SRC)
    hi = price_position(open_position(LONG, "btc", 50, 5, 100), SRC)
    assert hi.total_pct > lo.total_pct


def test_gap_premium_grows_with_buffer():
    pos = open_position(LONG, "btc", 50, 5, 100)
    low = price_position(pos, SRC, TariffConfig(gap_buffer=1.0))
    high = price_position(pos, SRC, TariffConfig(gap_buffer=2.0))
    assert high.gap_premium == pytest.approx(2.0 * low.gap_premium)
    assert high.capital_cost == pytest.approx(low.capital_cost)
    assert high.platform_cost == pytest.approx(low.platform_cost)


def test_barrier_matches_knockout():
    pos = open_position(LONG, "btc", entry=50, leverage=5, margin=100)  # нокаут 40
    assert barrier_ticks(pos) == 10


def test_capital_cost_scales_with_payout():
    small = price_position(open_position(LONG, "btc", 50, 2, 100), SRC)
    big = price_position(open_position(LONG, "btc", 50, 5, 100), SRC)
    assert big.capital_cost > small.capital_cost


def test_swap_source_without_changing_tariff():
    class ZeroSource:
        def lookup(self, barrier):
            return (0.0, 0.0)

    pos = open_position(LONG, "btc", 50, 5, 100)
    real = price_position(pos, SRC)
    zero = price_position(pos, ZeroSource())
    assert zero.gap_premium == 0.0
    assert real.gap_premium > 0.0
    assert zero.capital_cost == pytest.approx(real.capital_cost)


def test_short_also_priced():
    pos = open_position(SHORT, "btc", entry=50, leverage=5, margin=100)
    b = price_position(pos, SRC)
    assert b.total > 0