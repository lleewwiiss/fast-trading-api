import { ExchangeName } from "./types/exchange.types";
import type { Store, StoreMemory } from "./types/lib.types";
import type { ObjectPaths, ObjectChangeCommand } from "./types/misc.types";

import { applyChanges } from "~/utils/update-obj-path.utils";

export class MemoryStore implements Store {
  memory: StoreMemory = {
    [ExchangeName.BYBIT]: {
      public: {
        tickers: {},
        markets: {},
        orderBooks: {},
        ohlcv: {},
      },
      private: {},
    },
  };

  constructor() {}

  applyChanges = <P extends ObjectPaths<StoreMemory>>(
    changes: ObjectChangeCommand<StoreMemory, P>[],
  ) => {
    applyChanges({ obj: this.memory, changes });
  };
}
