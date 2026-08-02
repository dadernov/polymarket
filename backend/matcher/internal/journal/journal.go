// matcher/internal/journal/journal.go
package journal

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"

	"predmarket/matcher/internal/book"
)

// Publisher пишет сделки в durable-лог Redpanda.
type Publisher struct {
	client *kgo.Client
	topic  string
}

func New(brokers []string, topic string) (*Publisher, error) {
	cl, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		kgo.AllowAutoTopicCreation(), // на PoC топик создастся сам при первой записи
	)
	if err != nil {
		return nil, err
	}
	return &Publisher{client: cl, topic: topic}, nil
}

// Publish записывает одну сделку. Ключ = market:maker:taker — связанные сделки
// лягут по порядку, это основа идемпотентной сверки позже.
func (p *Publisher) Publish(ctx context.Context, f book.Fill) error {
	value, err := json.Marshal(map[string]any{
		"market_id": f.MarketID,
		"price":     f.Price,
		"qty":       f.Qty,
		"maker_id":  f.MakerId(),
		"taker_id":  f.TakerId(),
	})
	if err != nil {
		return err
	}
	key := fmt.Sprintf("%s:%d:%d", f.MarketID, f.MakerId(), f.TakerId())
	rec := &kgo.Record{Topic: p.topic, Key: []byte(key), Value: value}

	// синхронная запись: вернёмся только когда брокер подтвердил приём на диск
	return p.client.ProduceSync(ctx, rec).FirstErr()
}

func (p *Publisher) Close() { p.client.Close() }
