import { describe, mock, test, expect } from "bun:test";

import { watchObjPath } from "./watch-obj-path.utils";
import { applyChanges } from "./update-obj-path.utils";

describe("watchObjPath", () => {
  test("should call callback when property changes", () => {
    const store = { tickers: { BTCUSDT: { last: 100 } } };

    const callback = mock(() => {});
    const dispose = watchObjPath(store, "tickers.BTCUSDT", callback);

    applyChanges({
      obj: store,
      changes: [
        {
          type: "update",
          path: "tickers.BTCUSDT.last",
          value: 200,
        },
      ],
    });

    expect(store.tickers.BTCUSDT.last).toBe(200);
    expect(callback).toHaveBeenCalledTimes(1);

    dispose();
    applyChanges({
      obj: store,
      changes: [
        {
          type: "update",
          path: "tickers.BTCUSDT.last",
          value: 300,
        },
      ],
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(store.tickers.BTCUSDT.last).toBe(300);
  });

  test("should not call callback when property does not change", () => {
    const store = { tickers: { BTCUSDT: { last: 100 } } };

    const callback = mock(() => {});
    const dispose = watchObjPath(store, "tickers.BTCUSDT", callback);

    applyChanges({
      obj: store,
      changes: [
        {
          type: "update",
          path: "tickers.BTCUSDT.last",
          value: 100,
        },
      ],
    });

    expect(callback).not.toHaveBeenCalled();
    expect(store.tickers.BTCUSDT.last).toBe(100);

    dispose();
  });

  test("should notify on array changes", () => {
    const store = { orders: [{ id: 0, price: 100 }] };

    const callback = mock(() => {});
    const dispose = watchObjPath(store, "orders", callback);

    applyChanges({
      obj: store,
      changes: [
        {
          type: "update",
          path: "orders.1",
          value: { id: 1, price: 200 },
        },
      ],
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(store.orders.length).toBe(2);

    dispose();
  });
});
