import { createMemo, For, type Component } from "solid-js";
import { orderBy } from "fast-trading-api/dist/utils/order-by.utils";
import { afterDecimal } from "fast-trading-api/dist/utils/after-decimals.utils";

import { store } from "./fast-trading-api";

const App: Component = () => {
  const bybitTickers = createMemo(() => {
    return orderBy(
      Object.values(store.bybit.public.tickers),
      ["quoteVolume"],
      ["desc"],
    );
  });

  return (
    <div class="p-4">
      <h1 class="mb-4 text-3xl font-black">FAST-TRADING-API SOLIDJS DEMO</h1>
      <div class="w-[400px] border p-2 max-h-[400px] overflow-y-auto">
        <h2 class="mb-2 text-lg font-bold">BYBIT TICKERS</h2>
        <table class="table table-auto w-full">
          <thead>
            <tr class="text-xs font-mono uppercase">
              <th class="text-left">Symbol</th>
              <th class="text-right">Last</th>
              <th class="text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            <For each={bybitTickers()}>
              {(ticker) => (
                <tr class="text-xs font-mono">
                  <td class="font-bold">{ticker.cleanSymbol}</td>
                  <td class="text-right">
                    $
                    {ticker.last.toFixed(
                      afterDecimal(
                        store.bybit.public.markets[ticker.symbol].precision
                          .price,
                      ),
                    )}
                  </td>
                  <td class="text-right">{ticker.percentage.toFixed(2)}%</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default App;
