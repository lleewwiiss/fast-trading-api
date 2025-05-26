export type HLMetaAndAssetCtxs = [
  {
    universe: Array<{
      szDecimals: number;
      name: string;
      maxLeverage: number;
      marginTableId: number;
    }>;
  },
  Array<{
    funding: string;
    openInterest: string;
    prevDayPx: string;
    dayNtlVlm: string;
    premium: string;
    oraclePx: string;
    markPx: string;
    midPx: string;
    impactPxs: [string, string];
    dayBaseVlm: string;
  }>,
];

export type HLUserAccount = {
  assetPositions: Array<{
    position: {
      coin: string;
      cumFunding: {
        allTime: string;
        sinceChange: string;
        sinceOpen: string;
      };
      entryPx: string;
      leverage: {
        rawUsd: string;
        type: string;
        value: number;
      };
      liquidationPx: string;
      marginUsed: string;
      maxLeverage: number;
      positionValue: string;
      returnOnEquity: string;
      szi: string;
      unrealizedPnl: string;
    };
    type: string;
  }>;
  crossMaintenanceMarginUsed: string;
  crossMarginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  time: number;
  withdrawable: string;
};

export type HLUserOrder = {
  coin: string;
  isPositionTpsl: boolean;
  isTrigger: boolean;
  limitPx: string;
  oid: number;
  orderType: "Limit" | "Take Profit Market" | "Stop Market";
  origSz: string;
  reduceOnly: boolean;
  side: "A" | "B";
  sz: string;
  timestamp: number;
  triggerCondition: "N/A";
  triggerPx: string;
};

export type HLActiveAssetCtxWs = {
  channel: "activeAssetCtx";
  data: {
    coin: string;
    ctx: {
      funding: string;
      openInterest: string;
      prevDayPx: string;
      dayNtlVlm: string;
      premium: string | null;
      oraclePx: string;
      markPx: string;
      midPx: string | null;
      impactPxs: [string, string] | null;
      dayBaseVlm: string;
    };
  };
};

export type HLCandle = {
  T: number;
  c: string;
  h: string;
  i: string;
  l: string;
  n: number;
  o: string;
  s: string;
  t: number;
  v: string;
};

export type HLOrderUpdateWs = {
  order: HLUserOrder;
  status: "canceled" | "open";
};

export type HLAction =
  | {
      type: "order";
      orders: Array<{
        a: number;
        b: boolean;
        p: string;
        s: string;
        r: boolean;
        t:
          | { limit: { tif: "Alo" | "Ioc" | "Gtc" } }
          | {
              trigger: {
                isMarket: boolean;
                triggerPx: string;
                tpsl: "tp" | "sl";
              };
            };
      }>;
      grouping: "na" | "normalTpsl" | "positionTpsl";
      builder?: { b: string; f: number };
    }
  | {
      type: "cancel";
      cancels: Array<{
        a: number;
        o: number;
      }>;
    };

export interface HLPostResponseSuccess<T> {
  status: "ok";
  response: T;
}

export interface HLPostResponseError {
  status: "err";
  response: string;
}

export interface HLPostResponse<T> {
  channel: "post";
  data: {
    id: number;
    response: {
      type: "action";
      payload: HLPostResponseSuccess<T> | HLPostResponseError;
    };
  };
}

export type HLPostPlaceOrdersResponse = HLPostResponse<{
  type: "order";
  data: {
    statuses: Array<
      | {
          error: string;
        }
      | {
          filled: {
            oid: number;
            avgPx: string;
            totalSz: string;
          };
        }
      | {
          resting: {
            oid: number;
          };
        }
    >;
  };
}>;

export type HLPostCancelOrdersResponse = HLPostResponse<{
  type: "cancel";
  data: {
    statuses: Array<{ error: string } | string>;
  };
}>;
