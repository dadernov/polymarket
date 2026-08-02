# services/oracle/test_twap.py
import pytest

from twap import TWAP


def test_single_sample():
    tw = TWAP(window_sec=1800)
    tw.add(0, 50)
    assert tw.value(0) == 50


def test_constant_price():
    """Цена не менялась -> TWAP равен ей."""
    tw = TWAP(window_sec=1800)
    tw.add(0, 60)
    tw.add(600, 60)
    tw.add(1200, 60)
    assert tw.value(1800) == 60


def test_time_weighted_not_simple_average():
    """
    Цена 60 держалась 1740с, потом 40 держалась 60с.
    Простое среднее двух точек = 50. TWAP должен быть ~59 (60 держалась почти всё окно).
    """
    tw = TWAP(window_sec=1800)
    tw.add(0, 60)
    tw.add(1740, 40)     # 40 появилась только под конец
    twap = tw.value(1800)
    assert twap >= 59    # ближе к 60, а не к 50
    assert twap != 50


def test_manipulation_spike_barely_moves_twap():
    """
    Ключевой тест. Цена 62 весь час, злоумышленник роняет до 38 на 30 секунд.
    TWAP за 30 минут должен остаться выше нокаута 40 — манипуляция не проходит.
    """
    tw = TWAP(window_sec=1800)
    tw.add(0, 62)
    tw.add(1770, 38)     # шип вниз на 1770с
    tw.add(1800, 62)     # через 30с цена вернулась
    twap = tw.value(1800)
    assert twap > 40     # нокаут 40 НЕ выбит, хотя last price был 38


def test_last_price_would_have_been_fooled():
    """Для контраста: последняя цена в момент шипа = 38, ниже нокаута."""
    tw = TWAP(window_sec=1800)
    tw.add(0, 62)
    tw.add(1770, 38)
    # last price = 38 < 40 -> выбило бы нокаут; а TWAP (ниже) — нет
    assert tw.value(1770) > 40


def test_window_evicts_old_data():
    """Наблюдения старше окна не влияют на TWAP."""
    tw = TWAP(window_sec=600)  # окно 10 минут
    tw.add(0, 20)              # очень старое, должно выпасть
    tw.add(1000, 50)
    tw.add(1600, 50)
    assert tw.value(1600) == 50  # старая цена 20 не тянет вниз


def test_rejects_backwards_time():
    tw = TWAP(window_sec=600)
    tw.add(100, 50)
    with pytest.raises(ValueError):
        tw.add(50, 60)  # метка в прошлом