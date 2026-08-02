# services/robot/robot.py
"""
Робот-маркетмейкер: связывает ценовое ядро (LMSR) и расстановку (ladder)
с матчером по gRPC. Цикл: построить лесенку из текущей цены -> отправить в стакан
-> при сделке сдвинуть счётчики -> перецентровать лесенку.
"""
from __future__ import annotations

import time
import threading
import grpc

from gen import matcher_pb2 as pb
from gen import matcher_pb2_grpc as pb_grpc
from lmsr import LMSR
from ladder import build_ladder, Quote


# соответствие "сторона лесенки" -> "как это выглядит для матчера".
# Робот всегда котирует исход YES; BUY=купить YES, SELL=продать YES.
def _to_request(order_id: int, market_id: str, q: Quote) -> pb.SubmitRequest:
    intent = pb.INTENT_BUY if q.side == "BUY" else pb.INTENT_SELL
    return pb.SubmitRequest(
        order_id=order_id,
        market_id=market_id,
        outcome=pb.OUTCOME_YES,
        intent=intent,
        price=q.price,   # уже в тиках
        qty=q.qty,
        owner="robot",
    )


class Robot:
    def __init__(self, market_id: str, b: float, addr: str = "localhost:50051"):
        self.market_id = market_id
        self.lmsr = LMSR(b=b)
        self.channel = grpc.insecure_channel(addr)
        self.client = pb_grpc.MatcherStub(self.channel)
        self._next_id = 1000  # диапазон ID робота, чтобы не пересекаться с людьми
        self._active_ids: list[int] = []  # заявки текущей лесенки, чтобы снять при перецентровке

    def _new_id(self) -> int:
        self._next_id += 1
        return self._next_id

    def cancel_all(self) -> None:
        """Снять все заявки текущей лесенки. Основа перецентровки."""
        for oid in self._active_ids:
            self.client.Cancel(pb.CancelRequest(order_id=oid))
        if self._active_ids:
            print(f"сняли {len(self._active_ids)} старых заявок")
        self._active_ids = []

    def place_ladder(self) -> list[int]:
        """Перецентровка: снять старую лесенку, построить новую из текущей цены."""
        self.cancel_all()  # сначала убираем старые заявки — иначе робот съест сам себя

        fair = self.lmsr.price_yes()
        ladder = build_ladder(fair, levels=3, spread_ticks=1, step_ticks=1)
        for q in ladder:
            oid = self._new_id()
            resp = self.client.Submit(_to_request(oid, self.market_id, q))
            self._active_ids.append(oid)
            if resp.fills:
                for f in resp.fills:
                    print(f"  ВНИМАНИЕ: неожиданная сделка при постановке: "
                          f"price={f.price} qty={f.qty}")
        print(f"выставлена лесенка вокруг цены {fair:.3f} (тик {round(fair*100)}): "
              f"{len(ladder)} заявок")
        return list(self._active_ids)

    def observe_fill(self, outcome: str, qty: int) -> None:
        """
        Кто-то забрал котировку робота -> это спрос. Сдвигаем счётчики,
        цена LMSR меняется, следующая лесенка встанет уже вокруг новой цены.
        """
        self.lmsr.apply(outcome, qty)
        print(f"учли спрос: {outcome} +{qty} -> новая цена ДА {self.lmsr.price_yes():.3f}")

    def watch_fills(self) -> None:
        """
        Фоновая подписка на поток сделок. Когда в сделке участвует заявка робота,
        учитываем это как спрос и перецентруемся. Блокирующий цикл -> отдельный поток.
        """
        req = pb.StreamFillsRequest(market_id=self.market_id)
        for f in self.client.StreamFills(req):
            robot_is_maker = f.maker_id >= 1000
            robot_is_taker = f.taker_id >= 1000
            if not (robot_is_maker or robot_is_taker):
                continue  # сделка без робота — не наш спрос

            # упрощённо: любую сделку с роботом трактуем как спрос на ДА.
            # точный учёт стороны добавим с реестром заявок.
            print(f"[поток] сделка с роботом: price={f.price} qty={f.qty}")
            self.observe_fill("YES", f.qty)
            self.place_ladder()


def main():
    robot = Robot(market_id="m1", b=40)

    # фоновый поток слушает сделки и сам перецентрует робота
    watcher = threading.Thread(target=robot.watch_fills, daemon=True)
    watcher.start()

    robot.place_ladder()  # первая лесенка

    print("робот работает, слушает поток сделок. Ctrl+C для выхода.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        robot.cancel_all()
        print("робот остановлен, заявки сняты")


if __name__ == "__main__":
    main()