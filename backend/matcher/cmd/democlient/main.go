// matcher/cmd/democlient/main.go
package main

import (
	"context"
	"log"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	matcherv1 "predmarket/matcher/gen/matcherv1"
)

func main() {
	// подключаемся к нашему серверу (insecure — без TLS, это локальный PoC)
	conn, err := grpc.NewClient("localhost:50051",
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	client := matcherv1.NewMatcherClient(conn)
	ctx := context.Background()

	// 1) подписка на поток сделок в отдельной горутине
	go func() {
		stream, err := client.StreamFills(ctx, &matcherv1.StreamFillsRequest{MarketId: "m1"})
		if err != nil {
			log.Fatalf("stream: %v", err)
		}
		for {
			f, err := stream.Recv()
			if err != nil {
				return
			}
			log.Printf("[поток] сделка: price=%d qty=%d maker=%d taker=%d",
				f.Price, f.Qty, f.MakerId, f.TakerId)
		}
	}()
	time.Sleep(200 * time.Millisecond) // дать подписке подключиться

	// 2) продавец: продать YES по $0.50, объём 100 -> встанет в стакан
	sell, _ := client.Submit(ctx, &matcherv1.SubmitRequest{
		OrderId: 1, MarketId: "m1",
		Outcome: matcherv1.Outcome_OUTCOME_YES, Intent: matcherv1.Intent_INTENT_SELL,
		Price: 50, Qty: 100, Owner: "alice",
	})
	log.Printf("[submit sell] сделок сразу: %d (ожидаем 0 — встал в стакан)", len(sell.Fills))

	// 3) покупатель: купить YES по $0.50, объём 40 -> сведётся с продавцом
	buy, _ := client.Submit(ctx, &matcherv1.SubmitRequest{
		OrderId: 2, MarketId: "m1",
		Outcome: matcherv1.Outcome_OUTCOME_YES, Intent: matcherv1.Intent_INTENT_BUY,
		Price: 50, Qty: 40, Owner: "bob",
	})
	log.Printf("[submit buy] сделок: %d (ожидаем 1, qty=40)", len(buy.Fills))
	for _, f := range buy.Fills {
		log.Printf("  -> price=%d qty=%d maker=%d taker=%d", f.Price, f.Qty, f.MakerId, f.TakerId)
	}

	time.Sleep(200 * time.Millisecond) // дать потоку допечатать
}
