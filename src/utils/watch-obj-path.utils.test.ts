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

  test("should notify multiple listeners", () => {
    const store = { notifications: [{ id: 1 }] };

    const callback1 = mock(() => {});
    const callback2 = mock(() => {});

    const dispose1 = watchObjPath(store, "notifications", callback1);
    const dispose2 = watchObjPath(store, "notifications", callback2);

    applyChanges({
      obj: store,
      changes: [
        {
          type: "update",
          path: "notifications.1",
          value: { id: 2 },
        },
      ],
    });

    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledTimes(1);

    dispose1();

    applyChanges({
      obj: store,
      changes: [
        {
          type: "update",
          path: "notifications.2",
          value: { id: 3 },
        },
      ],
    });

    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledTimes(2);

    dispose2();

    expect(store.notifications.length).toBe(3);
    expect(store.notifications).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });
});
