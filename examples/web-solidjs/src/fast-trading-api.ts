import { FastTradingApi } from "fast-trading-api";
import { ExchangeName } from "fast-trading-api/dist/types/exchange.types";
import type { Store, StoreMemory } from "fast-trading-api/dist/types/lib.types";
import type {
  ObjectPaths,
  ObjectChangeCommand,
} from "fast-trading-api/dist/types/misc.types";
import { createStore } from "solid-js/store";
import { batch } from "solid-js";

export const [store, setStore] = createStore<StoreMemory>({
  [ExchangeName.BYBIT]: {
    public: { tickers: {}, markets: {} },
    private: {},
  },
});

class StoreConnector implements Store {
  memory: StoreMemory;

  constructor(memory: StoreMemory) {
    this.memory = memory;
  }

  applyChanges<P extends ObjectPaths<StoreMemory>>(
    changes: ObjectChangeCommand<StoreMemory, P>[],
  ) {
    batch(() => {
      for (const change of changes) {
        if (change.type === "update") {
          const path = change.path
            .split(".")
            .map((str) => (!isNaN(Number(str)) ? Number(str) : str));

          const args = [...path, change.value];
          setStore(...args);
        }
      }
    });
  }
}

const storeConnector = new StoreConnector(store);

new FastTradingApi({
  accounts: [
    {
      id: "main",
      exchange: ExchangeName.BYBIT,
      apiKey: process.env.BYBIT_API_KEY,
      apiSecret: process.env.BYBIT_API_SECRET,
    },
  ],
  store: storeConnector,
});
