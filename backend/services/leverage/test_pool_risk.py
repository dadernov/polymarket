# services/leverage/test_pool_risk.py
import pytest

from knockout import open_position, LONG, SHORT
from pool_risk import PoolRiskEngine, PoolLimits, Exposure


def _pos(direction, market="btc", entry=50, lev=5, margin=100):
    return open_position(direction, market, entry, lev, margin)


def test_netting_reduces_risk():
    """Встречные позиции гасят риск: перекос = |лонги - шорты|."""
    exp = Exposure(long_payout=800, short_payout=500)
    assert exp.net == 300


def test_perfectly_hedged_is_zero_risk():
    """Равные лонги и шорты -> нулевой чистый риск пула."""
    exp = Exposure(long_payout=500, short_payout=500)
    assert exp.net == 0


def test_accept_within_limits():
    eng = PoolRiskEngine(PoolLimits(capital=100_000))
    ok, _ = eng.can_accept(_pos(LONG))
    assert ok


def test_reject_over_market_limit():
    """Маленький пул: одна крупная позиция пробивает лимит на рынок."""
    eng = PoolRiskEngine(PoolLimits(capital=1_000))  # 3% = $30
    ok, reason = eng.can_accept(_pos(LONG, margin=100))  # payout $500 > $30
    assert not ok
    assert "per_market" in reason


def test_netting_allows_more_positions():
    """
    После лонга добавить шорт МОЖНО, даже если два лонга пробили бы лимит:
    шорт уменьшает перекос, а не увеличивает.
    """
    eng = PoolRiskEngine(PoolLimits(capital=20_000))  # 3% = $600; payout одной поз. $500
    eng.accept(_pos(LONG))                 # перекос 500, ок
    ok_short, _ = eng.can_accept(_pos(SHORT))  # перекос -> 0
    assert ok_short
    ok_long2, _ = eng.can_accept(_pos(LONG))   # перекос -> 1000 > 600
    assert not ok_long2



def test_cluster_limit():
    """
    Каждая позиция проходит лимит рынка (3% = $3000), но их сумма по кластеру
    пробивает лимит кластера (10% = $10_000). Капитал $100k.
    """
    clusters = {"btc": "crypto", "eth": "crypto", "sol": "crypto", "xrp": "crypto"}
    eng = PoolRiskEngine(PoolLimits(capital=100_000), clusters=clusters)

    # payout каждой позиции = $2500 < $3000 -> лимит рынка проходят
    eng.accept(_pos(LONG, market="btc", margin=500))  # crypto $2500
    eng.accept(_pos(LONG, market="eth", margin=500))  # crypto $5000
    eng.accept(_pos(LONG, market="sol", margin=500))  # crypto $7500
    # четвёртая: +$2500 -> $10_000, ещё не больше лимита; проверим пятую
    eng.accept(_pos(LONG, market="xrp", margin=500))  # crypto $10_000 (== лимит, ок)

    clusters["doge"] = "crypto"
    ok, reason = eng.can_accept(_pos(LONG, market="doge", margin=500))  # +$2500 -> $12_500 > $10k
    assert not ok
    assert "per_cluster" in reason


def test_global_limit():
    """
    Каждая позиция и её кластер проходят, но сумма по ВСЕМУ пулу пробивает
    глобальный лимит (30% = $3000). Капитал $10k, рынки некоррелированы.
    """
    eng = PoolRiskEngine(PoolLimits(capital=10_000))  # рынок 3%=$300, global 30%=$3000

    # payout каждой = $250 < $300 (лимит рынка) -> проходят по одной
    for m in ("m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"):
        eng.accept(_pos(LONG, market=m, margin=50))  # payout $250 каждая
    # 12 * $250 = $3000 == лимит. Тринадцатая пробьёт глобальный.
    ok, reason = eng.can_accept(_pos(LONG, market="m13", margin=50))
    assert not ok
    assert "global" in reason


def test_can_accept_is_pure():
    """can_accept НЕ меняет состояние — только проверяет."""
    eng = PoolRiskEngine(PoolLimits(capital=100_000))
    before = dict(eng.exposure)
    eng.can_accept(_pos(LONG))
    assert eng.exposure == before  # состояние не тронуто


def test_accept_rejects_over_limit():
    eng = PoolRiskEngine(PoolLimits(capital=1_000))
    with pytest.raises(ValueError):
        eng.accept(_pos(LONG, margin=100))