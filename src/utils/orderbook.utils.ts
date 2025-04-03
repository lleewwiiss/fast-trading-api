import { add } from "./safe-math.utils";

import {
  type ExchangeOrderBook,
  type OrderBookOrder,
} from "~/types/exchange.types";

export const sortOrderBook = (orderBook: ExchangeOrderBook) => {
  orderBook.asks.sort((a, b) => a.price - b.price);
  orderBook.bids.sort((a, b) => b.price - a.price);
};

export const calcOrderBookTotal = (orderBook: ExchangeOrderBook) => {
  Object.values(orderBook).forEach((orders: OrderBookOrder[]) => {
    orders.forEach((order, idx) => {
      order.total =
        idx === 0 ? order.amount : add(order.amount, orders[idx - 1].total);
    });
  });
};
