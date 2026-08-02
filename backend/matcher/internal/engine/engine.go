// matcher/internal/engine/engine.go
package engine

import (
	"context"

	"predmarket/matcher/internal/book"
)

type cmdKind uint8

const (
	cmdSubmit cmdKind = iota
	cmdCancel
)

// command — единица работы, проходящая через канал к владельцу.
type command struct {
	kind     cmdKind
	order    *book.Order
	cancelID uint64
	reply    chan Result // одноразовый канал для ответа этому вызову
}

type Result struct {
	Fills     []book.Fill
	Cancelled bool
}

// Engine владеет книгами. Снаружи к ним доступа нет — только через канал cmds.
type Engine struct {
	books  map[string]*book.Book
	cmds   chan command
	events chan<- book.Fill // исходящие сделки -> паблишер (другая горутина)
}

func New(events chan<- book.Fill) *Engine {
	return &Engine{
		books:  map[string]*book.Book{},
		cmds:   make(chan command, 1024), // буфер, чтобы хендлеры не ждали на отправке
		events: events,
	}
}

// Run — ЕДИНСТВЕННЫЙ владелец книг. Запускать строго в ОДНОЙ горутине.
// [КОНКУРЕНТНОСТЬ] Всё, что трогает b.books, происходит только здесь.
func (e *Engine) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return // корректная остановка по отмене контекста
		case c := <-e.cmds:
			e.handle(c)
		}
	}
}

func (e *Engine) handle(c command) {
	switch c.kind {
	case cmdSubmit:
		b, ok := e.books[c.order.MarketID]
		if !ok {
			b = book.NewBook(c.order.MarketID)
			e.books[c.order.MarketID] = b
		}
		fills := b.Add(c.order)
		for _, f := range fills {
			e.events <- f // публикация сделки (в PoC — в лог/Redpanda)
		}
		c.reply <- Result{Fills: fills}
	case cmdCancel:
		ok := false
		for _, b := range e.books {
			if b.Cancel(c.cancelID) {
				ok = true
				break
			}
		}
		c.reply <- Result{Cancelled: ok}
	}
}

// Submit — потокобезопасный фасад. Зовётся из множества gRPC-хендлеров.
// [КОНКУРЕНТНОСТЬ] книгу НЕ трогает: кладёт команду в канал и ждёт ответ.
func (e *Engine) Submit(o *book.Order) Result {
	reply := make(chan Result, 1) // буфер 1: движок не блокируется, отдавая ответ
	e.cmds <- command{kind: cmdSubmit, order: o, reply: reply}
	return <-reply
}

// Cancel — тоже потокобезопасный фасад.
func (e *Engine) Cancel(id uint64) Result {
	reply := make(chan Result, 1)
	e.cmds <- command{kind: cmdCancel, cancelID: id, reply: reply}
	return <-reply
}
