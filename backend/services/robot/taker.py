# services/robot/taker.py
"""
Скрипт-«пользователь»: бьёт по котировке робота, создавая реальный спрос.
Робот вокруг цены 0.500 держит аски на 51,52,53 — покупаем ДА по 55,
заявка сведётся с самой дешёвой аской робота.
"""
import sys

import grpc

from gen import matcher_pb2 as pb
from gen import matcher_pb2_grpc as pb_grpc


def main():
    qty = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    price = int(sys.argv[2]) if len(sys.argv) > 2 else 55

    channel = grpc.insecure_channel("localhost:50051")
    client = pb_grpc.MatcherStub(channel)

    resp = client.Submit(pb.SubmitRequest(
        order_id=1,               # ID < 1000 -> это "человек", не робот
        market_id="m1",
        outcome=pb.OUTCOME_YES,
        intent=pb.INTENT_BUY,     # покупаем ДА
        price=price,              # готовы платить до 55 тиков
        qty=qty,
        owner="human",
    ))

    print(f"тейкер: купить ДА qty={qty} по цене<= {price}")
    if resp.fills:
        for f in resp.fills:
            print(f"  исполнено: price={f.price} qty={f.qty} maker={f.maker_id}")
    else:
        print("  сделок нет (робот не стоит или цена не пересеклась)")


if __name__ == "__main__":
    main()