import type {
  Account,
  FetchOHLCVParams,
  Order,
  PlaceOrderOpts,
  Timeframe,
  TWAPOpts,
} from "~/types/lib.types";

export type ExchangeWorkerMessage = MessageEvent<
  | { type: "start"; accounts: Account[]; requestId: string }
  | { type: "addAccounts"; accounts: Account[]; requestId: string }
  | { type: "stop" }
  | { type: "listenOB"; symbol: string }
  | { type: "unlistenOB"; symbol: string }
  | { type: "fetchOHLCV"; requestId: string; params: FetchOHLCVParams }
  | { type: "listenOHLCV"; symbol: string; timeframe: Timeframe }
  | { type: "unlistenOHLCV"; symbol: string; timeframe: Timeframe }
  | {
      type: "placeOrders";
      orders: PlaceOrderOpts[];
      accountId: string;
      requestId: string;
      priority?: boolean;
    }
  | {
      type: "cancelOrders";
      orderIds: string[];
      accountId: string;
      requestId: string;
      priority?: boolean;
    }
  | {
      type: "updateOrders";
      updates: {
        order: Order;
        update: { amount: number } | { price: number };
      }[];
      accountId: string;
      requestId: string;
      priority?: boolean;
    }
  | {
      type: "fetchPositionMetadata";
      requestId: string;
      accountId: string;
      symbol: string;
    }
  | {
      type: "setLeverage";
      requestId: string;
      accountId: string;
      symbol: string;
      leverage: number;
    }
  | {
      type: "startTwap";
      requestId: string;
      accountId: string;
      twap: TWAPOpts;
    }
  | {
      type: "pauseTwap";
      requestId: string;
      accountId: string;
      twapId: string;
    }
  | {
      type: "resumeTwap";
      requestId: string;
      accountId: string;
      twapId: string;
    }
  | {
      type: "stopTwap";
      requestId: string;
      accountId: string;
      twapId: string;
    }
>;
