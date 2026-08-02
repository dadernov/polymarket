# services/leverage/test_knockout.py
import pytest

from knockout import open_position, is_knocked_out, LONG, SHORT


def test_long_knockout_below_entry():
    pos = open_position(LONG, "btc", entry=50, leverage=5, margin=100)
    assert pos.knockout == 40


def test_short_knockout_above_entry():
    pos = open_position(SHORT, "btc", entry=50, leverage=5, margin=100)
    assert pos.knockout == 60


def test_max_loss_equals_margin():
    """Ключевое свойство: максимальный убыток игрока всегда = внесённой марже."""
    for d in (LONG, SHORT):
        for L in (2, 3, 5):
            pos = open_position(d, "btc", entry=40, leverage=L, margin=250)
            assert pos.max_loss == pytest.approx(250, rel=1e-9)


def test_higher_leverage_closer_knockout():
    lo = open_position(LONG, "btc", entry=60, leverage=2, margin=100)
    hi = open_position(LONG, "btc", entry=60, leverage=5, margin=100)
    assert abs(60 - hi.knockout) < abs(60 - lo.knockout)


def test_knockout_within_bounds():
    for e in (5, 25, 50, 75, 95):
        for d in (LONG, SHORT):
            pos = open_position(d, "btc", entry=e, leverage=5, margin=100)
            assert 0 <= pos.knockout <= 100


def test_pool_payout_exceeds_margin():
    """Асимметрия: пул рискует больше, чем маржа игрока -> нужен тариф и лимиты."""
    pos = open_position(LONG, "btc", entry=50, leverage=5, margin=100)
    assert pos.max_payout > pos.margin


def test_long_short_symmetry():
    """LONG на входе p зеркалит SHORT на входе (100-p): расстояние до нокаута равно."""
    lo = open_position(LONG, "btc", entry=30, leverage=5, margin=100)
    sh = open_position(SHORT, "btc", entry=70, leverage=5, margin=100)
    assert (30 - lo.knockout) == (sh.knockout - 70)


def test_is_knocked_out_long():
    pos = open_position(LONG, "btc", entry=50, leverage=5, margin=100)  # нокаут 40
    assert not is_knocked_out(pos, 45)
    assert is_knocked_out(pos, 40)
    assert is_knocked_out(pos, 38)


def test_is_knocked_out_short():
    pos = open_position(SHORT, "btc", entry=50, leverage=5, margin=100)  # нокаут 60
    assert not is_knocked_out(pos, 55)
    assert is_knocked_out(pos, 60)
    assert is_knocked_out(pos, 62)


def test_validation():
    with pytest.raises(ValueError):
        open_position("UP", "btc", 50, 3, 100)      # кривое направление
    with pytest.raises(ValueError):
        open_position(LONG, "btc", 50, 6, 100)      # плечо > 5
    with pytest.raises(ValueError):
        open_position(LONG, "btc", 50, 1, 100)      # плечо = 1
    with pytest.raises(ValueError):
        open_position(LONG, "btc", 0, 3, 100)       # вход на границе
    with pytest.raises(ValueError):
        open_position(LONG, "btc", 50, 3, 0)        # маржа 0