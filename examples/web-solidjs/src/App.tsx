import { createMemo, For, type Component } from "solid-js";

import { store } from "./fast-trading-api";

const App: Component = () => {
  const bybitTickers = createMemo(() => {
    return Object.values(store.bybit.public.tickers);
  });

  return (
    <div>
      <For each={bybitTickers()}>
        {(ticker) => (
          <div>
            <span>{ticker.symbol}</span>
            <span>{ticker.last}</span>
          </div>
        )}
      </For>
    </div>
  );
};

export default App;
