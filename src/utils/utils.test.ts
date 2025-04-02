import { describe, expect, test } from "bun:test";

import {
  removeArrayElementAtPath,
  updateObjectPath,
} from "./update-obj-path.utils";

type Store = Record<
  "bybit",
  {
    public: {
      tickers: Record<string, { last: number }>;
    };
    private: Record<
      string,
      {
        balance: { total: number };
        positions: { upnl: number }[];
      }
    >;
  }
>;

describe("utils", () => {
  const store: Store = {
    bybit: {
      public: { tickers: {} },
      private: {},
    },
  };

  test("updateObjectPath()", () => {
    updateObjectPath({
      obj: store,
      path: "bybit.public.tickers",
      value: {
        BTCUSDT: { last: 1000 },
      },
    });
    expect(store.bybit.public.tickers.BTCUSDT.last).toBe(1000);

    updateObjectPath({
      obj: store,
      path: "bybit.public.tickers.BTCUSDT.last",
      value: 2000,
    });
    expect(store.bybit.public.tickers.BTCUSDT.last).toBe(2000);

    updateObjectPath({
      obj: store,
      path: "bybit.private.main",
      value: {
        balance: { total: 1000 },
        positions: [{ upnl: 100 }],
      },
    });

    expect(store.bybit.private.main.balance.total).toBe(1000);
    expect(store.bybit.private.main.positions[0].upnl).toBe(100);

    updateObjectPath({
      obj: store,
      path: "bybit.private.main.balance.total",
      value: 2000,
    });
    expect(store.bybit.private.main.balance.total).toBe(2000);

    updateObjectPath({
      obj: store,
      path: "bybit.private.main.positions.0.upnl",
      value: 200,
    });
    expect(store.bybit.private.main.positions[0].upnl).toBe(200);

    updateObjectPath({
      obj: store,
      path: "bybit.private.main.positions.1",
      value: { upnl: 300 },
    });
    expect(store.bybit.private.main.positions[1].upnl).toBe(300);
  });

  test("removeArrayElementAtPath()", () => {
    expect(store.bybit.private.main.positions.length).toBe(2);
    expect(store.bybit.private.main.positions[0].upnl).toBe(200);

    removeArrayElementAtPath({
      obj: store,
      path: "bybit.private.main.positions",
      index: 0,
    });

    expect(store.bybit.private.main.positions.length).toBe(1);
    expect(store.bybit.private.main.positions[0].upnl).toBe(300);
  });
});
