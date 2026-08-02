# services/pipeline/synthetic.py
"""
Генератор синтетических ценовых рядов для калибровки λ/J.

Модель — «прыжок-диффузия»: цена = маленький нормальный шум КАЖДЫЙ шаг
+ редкие крупные прыжки (Пуассон определяет, случился ли прыжок на шаге).
Мы САМИ задаём частоту и размер прыжков -> знаем правильный ответ калибровки.

Цена живёт в тиках (0..100), как везде в проекте.
"""
from __future__ import annotations

import numpy as np


def generate_path(
    n_steps: int = 100_000,
    p0: float = 50.0,          # старт по центру (тик 50 = $0.50)
    diffusion_sigma: float = 0.3,   # ст.отклонение обычного шума за шаг (тики)
    jump_prob: float = 0.01,        # вероятность прыжка на любом шаге
    jump_sigma: float = 5.0,        # ст.отклонение размера прыжка (тики)
    seed: int | None = 42,
) -> np.ndarray:
    """
    Возвращает массив цен длины n_steps.

    Каждый шаг: прибавляем нормальный шум N(0, diffusion_sigma).
    С вероятностью jump_prob дополнительно прибавляем прыжок N(0, jump_sigma).
    Цена зажата в [1, 99] — как коридор из ценового ядра.
    """
    rng = np.random.default_rng(seed)

    # обычный шум на каждом шаге
    diffusion = rng.normal(0.0, diffusion_sigma, n_steps)

    # прыжки: сначала бросаем монетку "прыгать ли?", потом размер
    jump_occurs = rng.random(n_steps) < jump_prob     # True там, где прыжок
    jump_size = rng.normal(0.0, jump_sigma, n_steps)  # размеры (учтём только где occurs)
    jumps = jump_occurs * jump_size

    steps = diffusion + jumps
    path = p0 + np.cumsum(steps)          # накопленная сумма = траектория цены
    return np.clip(path, 1.0, 99.0)       # держим в коридоре тиков


def step_changes(path: np.ndarray) -> np.ndarray:
    """Пошаговые изменения цены |Δ| — база для измерения λ и J."""
    return np.abs(np.diff(path))