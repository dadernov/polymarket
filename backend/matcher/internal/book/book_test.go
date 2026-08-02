// matcher/internal/book/book_test.go
package book

import "testing"

func TestNormalize_BuyNO_toSellYES(t *testing.T) {
	s, p := Normalize(NO, Buy, 30) // купить NO по $0.30
	if s != Ask || p != 70 {       // = продать YES по $0.70
		t.Fatalf("got side=%d price=%d, want Ask 70", s, p)
	}
}

func TestNormalize_SellNO_toBuyYES(t *testing.T) {
	s, p := Normalize(NO, Sell, 30)
	if s != Bid || p != 70 {
		t.Fatalf("got side=%d price=%d, want Bid 70", s, p)
	}
}

func TestBook_CrossFills(t *testing.T) {
	b := NewBook("m1")
	if f := b.Add(&Order{ID: 1, MarketID: "m1", Side: Ask, Price: 50, Qty: 100}); len(f) != 0 {
		t.Fatalf("resting ask should not fill, got %d fills", len(f))
	}
	f := b.Add(&Order{ID: 2, MarketID: "m1", Side: Bid, Price: 50, Qty: 40})
	if len(f) != 1 || f[0].Qty != 40 || f[0].Price != 50 {
		t.Fatalf("want 1 fill qty40 @50, got %+v", f)
	}
}

func TestBook_PriceTimePriority(t *testing.T) {
	b := NewBook("m1")
	b.Add(&Order{ID: 1, MarketID: "m1", Side: Ask, Price: 50, Qty: 10})
	b.Add(&Order{ID: 2, MarketID: "m1", Side: Ask, Price: 50, Qty: 10})
	f := b.Add(&Order{ID: 3, MarketID: "m1", Side: Bid, Price: 50, Qty: 10})
	if len(f) != 1 || f[0].MakerID != 1 { // FIFO: снялась первая аска
		t.Fatalf("want maker=1 (FIFO), got %+v", f)
	}
}

func TestBook_Cancel(t *testing.T) {
	b := NewBook("m1")
	b.Add(&Order{ID: 1, MarketID: "m1", Side: Ask, Price: 50, Qty: 10})
	if !b.Cancel(1) {
		t.Fatal("cancel should find order 1")
	}
	f := b.Add(&Order{ID: 2, MarketID: "m1", Side: Bid, Price: 50, Qty: 10})
	if len(f) != 0 { // контрагента больше нет
		t.Fatalf("book should be empty after cancel, got %+v", f)
	}
}
