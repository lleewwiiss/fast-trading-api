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
  orderType: "Limit";
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
