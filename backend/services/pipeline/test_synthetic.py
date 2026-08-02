# services/pipeline/test_synthetic.py
import numpy as np

from synthetic import generate_path, step_changes


def test_path_length_and_bounds():
    path = generate_path(n_steps=10_000)
    assert len(path) == 10_000
    assert path.min() >= 1.0 and path.max() <= 99.0  # коридор соблюдён


def test_deterministic_with_seed():
    """Один seed -> один и тот же ряд. Важно для воспроизводимых тестов."""
    a = generate_path(n_steps=1_000, seed=7)
    b = generate_path(n_steps=1_000, seed=7)
    assert np.array_equal(a, b)


def test_jumps_create_fat_tail():
    """
    С прыжками крупных изменений заметно больше, чем без них.
    Проверяем, что прыжки реально утяжеляют хвост распределения |Δ|.
    """
    calm = step_changes(generate_path(n_steps=50_000, jump_prob=0.0, seed=1))
    jumpy = step_changes(generate_path(n_steps=50_000, jump_prob=0.05, seed=1))
    big = 3.0  # порог "крупного" изменения в тиках
    assert (jumpy > big).sum() > (calm > big).sum()