import { describe, mock, test, expect } from "bun:test";

import { watchObjPath } from "./watch-obj-path.utils";

describe("watchObjPath", () => {
  test("should call callback when property changes", () => {
    const store = { tickers: { BTCUSDT: { last: 100 } } };

    const callback = mock(() => {});
    const dispose = watchObjPath(store, "tickers.BTCUSDT", callback);

    store.tickers.BTCUSDT.last = 200;

    expect(callback).toHaveBeenCalled();
    dispose();

    store.tickers.BTCUSDT.last = 300;
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("should not call callback when property does not change", () => {
    const store = { tickers: { BTCUSDT: { last: 100 } } };

    const callback = mock(() => {});
    const dispose = watchObjPath(store, "tickers.BTCUSDT", callback);

    store.tickers.BTCUSDT.last = 100;

    expect(callback).not.toHaveBeenCalled();
    dispose();
  });
});
