import { ExchangeName } from "./types/lib.types";
import type { Store, StoreMemory } from "./types/lib.types";
import type { ObjectPaths, ObjectChangeCommand } from "./types/misc.types";

import { applyChanges } from "~/utils/update-obj-path.utils";

export const defaultStoreState: StoreMemory = {
  [ExchangeName.BYBIT]: {
    loaded: {
      markets: false,
      tickers: false,
    },
    public: {
      latency: 0,
      tickers: {},
      markets: {},
      orderBooks: {},
    },
    private: {},
  },
};

export class MemoryStore implements Store {
  memory: StoreMemory = JSON.parse(JSON.stringify(defaultStoreState));

  constructor() {}

  reset = () => {
    this.memory = JSON.parse(JSON.stringify(defaultStoreState));
  };

  applyChanges = <P extends ObjectPaths<StoreMemory>>(
    changes: ObjectChangeCommand<StoreMemory, P>[],
  ) => {
    applyChanges({ obj: this.memory, changes });
  };
}
