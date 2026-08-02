# services/pipeline/fetch_polymarket.py
"""
Ручной эксперимент (шаг В): найти и скачать историю цен рынка Polymarket.

Два режима:
  search <слово>            — найти активные события по ключевому слову
  fetch  <event-slug> [idx] — скачать историю рынка [idx] из события в CSV

Иерархия: СОБЫТИЕ содержит РЫНКИ (бинарные YES/NO). История — на уровне рынка.
"""
from __future__ import annotations

import csv
import json
import sys

import requests

GAMMA = "https://gamma-api.polymarket.com"
CLOB = "https://clob.polymarket.com"


def search_events(keyword: str, limit: int = 20) -> None:
    """Найти активные события по слову и напечатать их slug'и."""
    r = requests.get(
        f"{GAMMA}/events",
        params={"active": "true", "closed": "false", "limit": limit, "order": "volume24hr",
                "ascending": "false"},
        timeout=30,
    )
    r.raise_for_status()
    events = r.json()
    kw = keyword.lower()
    hits = [e for e in events if kw in e.get("title", "").lower()]
    if not hits:
        # если по слову пусто — покажем топ по объёму, чтобы было из чего выбрать
        print(f"по слову '{keyword}' точных совпадений нет; топ активных по объёму:")
        hits = events
    for e in hits:
        n = len(e.get("markets", []))
        print(f"  slug={e.get('slug', '?')}  рынков={n}  |  {e.get('title', '?')}")


def get_event(slug: str) -> dict:
    r = requests.get(f"{GAMMA}/events", params={"slug": slug}, timeout=30)
    r.raise_for_status()
    events = r.json()
    if not events:
        raise SystemExit(f"событие '{slug}' не найдено")
    return events[0]


def token_id_of(market: dict) -> str:
    raw = market["clobTokenIds"]
    ids = raw if isinstance(raw, list) else json.loads(raw)
    return ids[0]  # YES


def fetch_history(token_id: str, interval: str = "max", fidelity: int = 1) -> list[dict]:
    r = requests.get(
        f"{CLOB}/prices-history",
        params={"market": token_id, "interval": interval, "fidelity": fidelity},
        timeout=60,
    )
    r.raise_for_status()
    return r.json().get("history", [])


def do_fetch(slug: str, idx: int) -> None:
    event = get_event(slug)
    markets = event.get("markets", [])
    print(f"событие: {event.get('title', '?')}  (рынков: {len(markets)})")
    for i, m in enumerate(markets):
        print(f"  [{i}] {m.get('question', '?')}")
    if idx >= len(markets):
        raise SystemExit(f"индекс {idx} вне диапазона")

    market = markets[idx]
    token_id = token_id_of(market)
    print(f"\nвыбран [{idx}]: {market.get('question', '?')}")
    print(f"token_id (YES): {token_id}")

    history = fetch_history(token_id)
    print(f"получено точек: {len(history)}")
    if not history:
        raise SystemExit("история пуста")

    out = "polymarket_series.csv"
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "price"])
        for p in history:
            w.writerow([p["t"], p["p"]])
    prices = [p["p"] for p in history]
    print(f"сохранено {len(history)} точек в {out}")
    print(f"цена: min {min(prices):.3f}, max {max(prices):.3f}, "
          f"первая {prices[0]:.3f}, последняя {prices[-1]:.3f}")


def main():
    if len(sys.argv) < 2:
        raise SystemExit("режимы:\n  search <слово>\n  fetch <event-slug> [индекс]")
    mode = sys.argv[1]
    if mode == "search":
        search_events(sys.argv[2] if len(sys.argv) > 2 else "")
    elif mode == "fetch":
        if len(sys.argv) < 3:
            raise SystemExit("fetch требует <event-slug> [индекс]")
        do_fetch(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0)
    else:
        raise SystemExit(f"неизвестный режим '{mode}'")


if __name__ == "__main__":
    main()