// matcher/internal/engine/engine_test.go
package engine

import (
	"context"
	"sync"
	"testing"

	"predmarket/matcher/internal/book"
)

// Запускать: go test -race ./...
// [КОНКУРЕНТНОСТЬ] Тест намеренно бьёт по движку из многих горутин сразу.
// Если бы книга была под общим доступом без владельца — -race бы это поймал.
func TestConcurrentSubmit_NoRace(t *testing.T) {
	events := make(chan book.Fill, 100000)
	go func() { // дренаж событий, чтобы канал не переполнился
		for range events {
		}
	}()

	e := New(events)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go e.Run(ctx) // владелец — ровно одна горутина

	const N = 1000
	var wg sync.WaitGroup
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			side := book.Bid
			if id%2 == 1 {
				side = book.Ask
			}
			e.Submit(&book.Order{
				ID: uint64(id + 1), MarketID: "m1",
				Side: side, Price: 50, Qty: 1, Owner: "u",
			})
		}(i)
	}
	wg.Wait() // ждём завершения всех 1000 горутин
}

// Детерминированная проверка корректности через фасад (без гонок).
func TestSubmit_MatchesThroughEngine(t *testing.T) {
	events := make(chan book.Fill, 16)
	go func() {
		for range events {
		}
	}()

	e := New(events)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go e.Run(ctx)

	e.Submit(&book.Order{ID: 1, MarketID: "m1", Side: book.Ask, Price: 50, Qty: 10})
	res := e.Submit(&book.Order{ID: 2, MarketID: "m1", Side: book.Bid, Price: 50, Qty: 4})

	if len(res.Fills) != 1 || res.Fills[0].Qty != 4 {
		t.Fatalf("want 1 fill qty4, got %+v", res.Fills)
	}
}
