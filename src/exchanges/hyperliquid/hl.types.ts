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
