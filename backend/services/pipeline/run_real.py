# services/pipeline/run_real.py
"""
Прогон РЕАЛЬНОГО ряда Polymarket через калибровку λ/J.
Момент истины: осмысленны ли барьеры и премии на живых данных.
"""
from calibrate import load_csv, build_table
from synthetic import step_changes


def main():
    prices = load_csv("polymarket_series.csv")
    changes = step_changes(prices)  # |Δ| между соседними минутами, в тиках

    print(f"точек цены: {len(prices)}")
    print(f"шагов |Δ|: {len(changes)}")
    print(f"средний |Δ|: {changes.mean():.3f} тика, макс |Δ|: {changes.max():.3f} тика")
    print()

    barriers = [1.0, 2.0, 3.0, 5.0, 10.0]
    table = build_table(changes, barriers)

    print(f"{'барьер d':>10} {'λ(d)':>10} {'J(d)':>10} {'премия λ·J':>14}")
    print("-" * 46)
    for pt in table:
        print(f"{pt.barrier:>10.1f} {pt.lam:>10.4f} {pt.overshoot:>10.3f} {pt.premium:>14.4f}")


if __name__ == "__main__":
    main()