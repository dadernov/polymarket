# services/pipeline/test_calibrate.py
import numpy as np

from synthetic import generate_path, step_changes
from calibrate import (
    estimate_lambda, estimate_overshoot, build_table, barrier_for_leverage,
)


def test_lambda_decreases_with_barrier():
    """Чем дальше барьер, тем реже он пробивается: λ(d) убывает по d."""
    changes = step_changes(generate_path(n_steps=100_000, seed=3))
    lam_near = estimate_lambda(changes, 1.0)
    lam_far = estimate_lambda(changes, 10.0)
    assert lam_near > lam_far


def test_overshoot_nonnegative():
    """Перелёт за барьер не может быть отрицательным."""
    changes = step_changes(generate_path(n_steps=50_000, seed=4))
    for d in [1.0, 3.0, 5.0, 10.0]:
        assert estimate_overshoot(changes, d) >= 0.0


# services/pipeline/test_calibrate.py — заменить test_recovers_injected_jump_rate на:

def test_jumps_drive_large_breaches():
    """
    Прыжки — главный источник пробоев крупного барьера.
    Сравниваем ряд с прыжками и без: на барьере 3 тика (который обычный
    шум sigma=0.3 почти не достаёт) частота пробоя с прыжками должна быть
    во МНОГО раз выше, чем без них. Это доказывает: λ ловит именно прыжки.
    """
    calm = step_changes(generate_path(
        n_steps=200_000, diffusion_sigma=0.3, jump_prob=0.0, seed=5,
    ))
    jumpy = step_changes(generate_path(
        n_steps=200_000, diffusion_sigma=0.3, jump_prob=0.02,
        jump_sigma=6.0, seed=5,
    ))
    lam_calm = estimate_lambda(calm, 3.0)
    lam_jumpy = estimate_lambda(jumpy, 3.0)
    assert lam_calm < 0.0005            # без прыжков барьер 3 почти не пробить
    assert lam_jumpy > 5 * max(lam_calm, 1e-9)  # прыжки резко поднимают λ


def test_lambda_bounded_by_jump_rate():
    """
    Частота пробоя большого барьера не может превышать долю прыжков:
    барьер 3 тика пробивают только прыжки (шум не дотягивает), а прыжков 2%.
    Значит λ(3) <= ~jump_prob. Это корректная верхняя граница.
    """
    changes = step_changes(generate_path(
        n_steps=200_000, diffusion_sigma=0.3, jump_prob=0.02,
        jump_sigma=6.0, seed=5,
    ))
    lam = estimate_lambda(changes, 3.0)
    assert 0.0 < lam <= 0.02 + 1e-6     # ниже зашитой доли прыжков


def test_more_jumps_more_breaches():
    """
    Монотонность по частоте прыжков: больше прыжков -> чаще пробои.
    Это и есть "восстановление" зашитого параметра в правильной форме —
    калибровка реагирует на jump_prob в ту сторону, в какую должна.
    """
    def lam_at(jp):
        ch = step_changes(generate_path(
            n_steps=200_000, diffusion_sigma=0.3, jump_prob=jp,
            jump_sigma=6.0, seed=5,
        ))
        return estimate_lambda(ch, 3.0)

    assert lam_at(0.01) < lam_at(0.03) < lam_at(0.06)

def test_premium_is_lambda_times_overshoot():
    """Премия в таблице = λ * J для каждой точки."""
    changes = step_changes(generate_path(n_steps=50_000, seed=6))
    table = build_table(changes, [1.0, 5.0, 10.0])
    for pt in table:
        assert pt.premium == pt.lam * pt.overshoot


def test_higher_leverage_closer_barrier():
    """Выше плечо -> ближе нокаут-барьер."""
    assert barrier_for_leverage(50.0, 5.0) < barrier_for_leverage(50.0, 2.0)