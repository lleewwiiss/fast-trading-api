import { FastTradingApi } from "fast-trading-api";
import { ExchangeName } from "fast-trading-api/dist/types/lib.types";
import { defaultStoreState } from "fast-trading-api/dist/store";
import type { Store, StoreMemory } from "fast-trading-api/dist/types/lib.types";
import { applyChanges } from "fast-trading-api/dist/utils/update-obj-path.utils";
import type {
  ObjectPaths,
  ObjectChangeCommand,
} from "fast-trading-api/dist/types/misc.types";
import { createStore, produce } from "solid-js/store";

export const [store, setStore] = createStore<StoreMemory>(
  JSON.parse(JSON.stringify(defaultStoreState)),
);

const storeConnector: Store = {
  memory: store,
  reset: () => setStore(JSON.parse(JSON.stringify(defaultStoreState))),
  applyChanges: <P extends ObjectPaths<StoreMemory>>(
    changes: ObjectChangeCommand<StoreMemory, P>[],
  ) => {
    setStore(produce((obj: StoreMemory) => applyChanges({ obj, changes })));
  },
};

const api = new FastTradingApi({
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

api.on("log", (msg: string) => console.log(msg));
api.on("error", (msg: string) => console.error(msg));

api.start();
