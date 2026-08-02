// matcher/cmd/matcher/main.go
package main

import (
	"context"
	"log"
	"net"
	"os/signal"
	"sync"
	"syscall"

	"google.golang.org/grpc"

	matcherv1 "predmarket/matcher/gen/matcherv1"
	"predmarket/matcher/internal/book"
	"predmarket/matcher/internal/engine"
	"predmarket/matcher/internal/journal"
)

// server реализует сгенерённый интерфейс MatcherServer.
type server struct {
	matcherv1.UnimplementedMatcherServer // обязательная встройка для forward-compat
	eng                                  *engine.Engine

	// подписчики на поток сделок: каждый стрим шлёт сюда через свой канал
	mu   sync.Mutex
	subs map[chan book.Fill]struct{}
}

func newServer(eng *engine.Engine) *server {
	return &server{eng: eng, subs: map[chan book.Fill]struct{}{}}
}

// Submit: перевод из сетевого запроса в вызов движка и обратно.
func (s *server) Submit(ctx context.Context, req *matcherv1.SubmitRequest) (*matcherv1.SubmitResponse, error) {
	// конвертация "снаружи (ДА/НЕТ, купить/продать)" -> "внутри (Bid/Ask по YES)"
	side, price := book.Normalize(
		book.Outcome(req.Outcome), book.Intent(req.Intent), book.Price(req.Price),
	)
	res := s.eng.Submit(&book.Order{
		ID: req.OrderId, MarketID: req.MarketId,
		Side: side, Price: price, Qty: req.Qty, Owner: req.Owner,
	})

	// раздаём сделки подписчикам потока
	for _, f := range res.Fills {
		s.broadcast(f)
	}

	out := make([]*matcherv1.Fill, 0, len(res.Fills))
	for _, f := range res.Fills {
		out = append(out, toProtoFill(f))
	}
	return &matcherv1.SubmitResponse{Fills: out}, nil
}

func (s *server) Cancel(ctx context.Context, req *matcherv1.CancelRequest) (*matcherv1.CancelResponse, error) {
	res := s.eng.Cancel(req.OrderId)
	return &matcherv1.CancelResponse{Cancelled: res.Cancelled}, nil
}

// StreamFills: клиент подписывается и получает каждую новую сделку по рынку.
func (s *server) StreamFills(req *matcherv1.StreamFillsRequest, stream matcherv1.Matcher_StreamFillsServer) error {
	ch := make(chan book.Fill, 256)
	s.addSub(ch)
	defer s.removeSub(ch)

	for {
		select {
		case <-stream.Context().Done(): // клиент отвалился — выходим
			return nil
		case f := <-ch:
			if req.MarketId != "" && f.MarketID != req.MarketId {
				continue // фильтр по нужному рынку
			}
			if err := stream.Send(toProtoFill(f)); err != nil {
				return err
			}
		}
	}
}

// --- вспомогательное: рассылка подписчикам ---
// [КОНКУРЕНТНОСТЬ] subs трогают разные горутины (Submit и стримы),
// поэтому здесь мьютекс уместен: это не ядро матчинга, а список подписок.
func (s *server) addSub(ch chan book.Fill) {
	s.mu.Lock()
	s.subs[ch] = struct{}{}
	s.mu.Unlock()
}
func (s *server) removeSub(ch chan book.Fill) {
	s.mu.Lock()
	delete(s.subs, ch)
	s.mu.Unlock()
}
func (s *server) broadcast(f book.Fill) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for ch := range s.subs {
		select {
		case ch <- f: // не блокируемся на медленном подписчике
		default:
		}
	}
}

func toProtoFill(f book.Fill) *matcherv1.Fill {
	return &matcherv1.Fill{
		MakerId: f.MakerId(), TakerId: f.TakerId(),
		MarketId: f.MarketID, Price: uint32(f.Price), Qty: f.Qty,
	}
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// events: движок шлёт сюда сделки. Пишем в durable-лог Redpanda.
	events := make(chan book.Fill, 4096)

	pub, err := journal.New([]string{"localhost:9092"}, "fills")
	if err != nil {
		log.Fatalf("journal: %v", err)
	}
	defer pub.Close()

	go func() {
		for f := range events {
			if err := pub.Publish(context.Background(), f); err != nil {
				log.Printf("journal publish error: %v", err) // журнал упал — но движок не роняем
				continue
			}
			log.Printf("FILL market=%s price=%d qty=%d maker=%d taker=%d",
				f.MarketID, f.Price, f.Qty, f.MakerId(), f.TakerId())
		}
	}()

	eng := engine.New(events)
	go eng.Run(ctx) // [КОНКУРЕНТНОСТЬ] владелец книг — одна горутина

	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatalf("listen: %v", err)
	}
	grpcServer := grpc.NewServer()
	matcherv1.RegisterMatcherServer(grpcServer, newServer(eng))

	go func() {
		<-ctx.Done()
		grpcServer.GracefulStop() // корректная остановка по Ctrl+C
	}()

	log.Println("matcher gRPC on :50051")
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("serve: %v", err)
	}
}
