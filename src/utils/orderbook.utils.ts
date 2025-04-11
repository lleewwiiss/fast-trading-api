import { add } from "./safe-math.utils";

import { type OrderBook, type OrderBookOrder } from "~/types/lib.types";

export const sortOrderBook = (orderBook: OrderBook) => {
  orderBook.asks.sort((a, b) => a.price - b.price);
  orderBook.bids.sort((a, b) => b.price - a.price);
};

export const calcOrderBookTotal = (orderBook: OrderBook) => {
  Object.values(orderBook).forEach((orders: OrderBookOrder[]) => {
    orders.forEach((order, idx) => {
      order.total =
        idx === 0 ? order.amount : add(order.amount, orders[idx - 1].total);
    });
  });
};
