// matcher/internal/book/order.go
package book

// Side книги. Мы нормализуем ВСЁ в единый стакан YES.
type Side uint8

const (
	Bid Side = iota // покупатель YES
	Ask             // продавец YES
)

// Price — цена YES в тиках (целое). 1 тик = $0.01, диапазон 0..100.
// Деньги во float не храним никогда — только целые.
type Price uint32

const OneDollar Price = 100 // $1.00 = 100 тиков

// Order — заявка, УЖЕ нормализованная в YES-координаты.
type Order struct {
	ID       uint64
	MarketID string
	Side     Side
	Price    Price
	Qty      uint64 // остаток к исполнению
	Owner    string
}

// Outcome/Intent — как заявка приходит снаружи (до нормализации).
type Outcome uint8

const (
	YES Outcome = iota
	NO
)

type Intent uint8

const (
	Buy Intent = iota
	Sell
)

// Normalize переводит внешнюю заявку в YES-координаты книги.
// Тождество YES + NO = $1:
//
//	buy YES @p  -> Bid @p
//	sell YES @p -> Ask @p
//	buy NO  @p  -> Ask @(1-p)   продать YES по 1-p
//	sell NO @p  -> Bid @(1-p)   купить YES по 1-p
//
// Чистая функция: без состояния и без гонок — идеальна для юнит-тестов.
func Normalize(o Outcome, i Intent, price Price) (Side, Price) {
	if o == YES {
		if i == Buy {
			return Bid, price
		}
		return Ask, price
	}
	if i == Buy {
		return Ask, OneDollar - price
	}
	return Bid, OneDollar - price
}
