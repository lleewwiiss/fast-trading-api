import { add, multiply } from "./safe-math.utils";

import { type OrderBook, type OrderBookOrder } from "~/types/lib.types";

export const sortOrderBook = (orderBook: OrderBook) => {
  orderBook.asks.sort((a, b) => a.price - b.price);
  orderBook.bids.sort((a, b) => b.price - a.price);
};

export const calcOrderBookTotal = (orderBook: OrderBook) => {
  for (const key in orderBook) {
    const orders = orderBook[key as keyof OrderBook];
    orders.forEach((order, idx) => {
      order.total =
        idx === 0 ? order.amount : add(order.amount, orders[idx - 1].total);
    });
  }
};

export const precisionGroup = (precision: number, orders: OrderBookOrder[]) => {
  const grouped = new Map<number, OrderBookOrder>();

  for (const order of orders) {
    const price = Math.floor(order.price / precision) * precision;
    const existing = grouped.get(price);

    if (existing) {
      existing.amount = add(existing.amount, order.amount);
      existing.total = order.total;
    } else {
      grouped.set(price, { ...order, price });
    }
  }

  return Array.from(grouped.values());
};

export const toDollars = (orderBook: OrderBook) => {
  const convert = (orders: OrderBookOrder[]) => {
    orders.forEach((o) => {
      o.amount = Math.round(multiply(o.amount, o.price) * 100) / 100;
    });
  };

  convert(orderBook.bids);
  convert(orderBook.asks);
};
