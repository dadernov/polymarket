// matcher/internal/book/book.go
package book

import "container/list"

// Fill — результат сведения тейкера с мейкером.
type Fill struct {
	MakerID  uint64
	TakerID  uint64
	MarketID string
	Price    Price
	Qty      uint64
}

type level struct {
	orders *list.List // FIFO очередь *Order (price-time priority)
}

// orderRef — где лежит заявка, для O(1) отмены.
type orderRef struct {
	side  Side
	price Price
	el    *list.Element
}

// Book — стакан одного рынка.
// [КОНКУРЕНТНОСТЬ] НЕ потокобезопасен НАМЕРЕННО. К нему прикасается только
// горутина-владелец (engine). Мьютексов здесь нет и быть не должно.
type Book struct {
	marketID string
	bids     map[Price]*level
	asks     map[Price]*level
	index    map[uint64]orderRef
}

func NewBook(marketID string) *Book {
	return &Book{
		marketID: marketID,
		bids:     map[Price]*level{},
		asks:     map[Price]*level{},
		index:    map[uint64]orderRef{},
	}
}

// Add сводит заявку с противоположной стороной, остаток ставит в стакан.
func (b *Book) Add(o *Order) []Fill {
	var fills []Fill
	if o.Side == Bid {
		for o.Qty > 0 {
			p, ok := b.bestAsk()
			if !ok || p > o.Price {
				break // лучшая аска дороже, чем готов платить бид — стоп
			}
			fills = b.matchAt(o, b.asks[p], p, fills)
		}
	} else {
		for o.Qty > 0 {
			p, ok := b.bestBid()
			if !ok || p < o.Price {
				break
			}
			fills = b.matchAt(o, b.bids[p], p, fills)
		}
	}
	if o.Qty > 0 {
		b.rest(o)
	}
	return fills
}

func (b *Book) matchAt(taker *Order, lv *level, price Price, fills []Fill) []Fill {
	for taker.Qty > 0 && lv.orders.Len() > 0 {
		el := lv.orders.Front()
		maker := el.Value.(*Order)
		q := taker.Qty
		if maker.Qty < q {
			q = maker.Qty
		}
		taker.Qty -= q
		maker.Qty -= q
		fills = append(fills, Fill{
			MakerID: maker.ID, TakerID: taker.ID,
			MarketID: b.marketID, Price: price, Qty: q,
		})
		if maker.Qty == 0 {
			lv.orders.Remove(el)
			delete(b.index, maker.ID)
		}
	}
	if lv.orders.Len() == 0 {
		if taker.Side == Bid {
			delete(b.asks, price)
		} else {
			delete(b.bids, price)
		}
	}
	return fills
}

func (b *Book) rest(o *Order) {
	side := b.bids
	if o.Side == Ask {
		side = b.asks
	}
	lv, ok := side[o.Price]
	if !ok {
		lv = &level{orders: list.New()}
		side[o.Price] = lv
	}
	el := lv.orders.PushBack(o)
	b.index[o.ID] = orderRef{side: o.Side, price: o.Price, el: el}
}

// Cancel убирает заявку по ID. true — если нашли и убрали.
func (b *Book) Cancel(id uint64) bool {
	ref, ok := b.index[id]
	if !ok {
		return false
	}
	side := b.bids
	if ref.side == Ask {
		side = b.asks
	}
	lv := side[ref.price]
	lv.orders.Remove(ref.el)
	if lv.orders.Len() == 0 {
		delete(side, ref.price)
	}
	delete(b.index, id)
	return true
}

func (b *Book) bestAsk() (Price, bool) {
	var best Price
	found := false
	for p := range b.asks {
		if !found || p < best {
			best, found = p, true
		}
	}
	return best, found
}

func (b *Book) bestBid() (Price, bool) {
	var best Price
	found := false
	for p := range b.bids {
		if !found || p > best {
			best, found = p, true
		}
	}
	return best, found
}

// в конец matcher/internal/book/book.go

// Геттеры для внешних слоёв (напр. gRPC), чтобы не путать с proto-полями Fill.
func (f Fill) MakerId() uint64 { return f.MakerID }
func (f Fill) TakerId() uint64 { return f.TakerID }
