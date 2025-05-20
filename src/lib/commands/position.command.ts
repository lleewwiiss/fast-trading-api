import {
  CLICommands,
  CLIMessageSeverity,
  type CLICommandArgs,
} from "./commands.types";

import { PositionSide, OrderSide, OrderType } from "~/types/lib.types";

export const closePositionCommand = ({
  api,
  onMessage,
  args,
}: CLICommandArgs) => {
  const [accountId, symbol] = args;

  const account = api.accounts.find((a) => a.id === accountId);

  if (!account) {
    onMessage(`Account not found: ${accountId}`, CLIMessageSeverity.Error);
    return;
  }

  if (symbol === "all") {
    const orders = api.store.memory[account.exchange].private[
      account.id
    ].positions.map((p) => ({
      symbol: p.symbol,
      side: p.side === PositionSide.Long ? OrderSide.Sell : OrderSide.Buy,
      type: OrderType.Market,
      amount: p.contracts,
      reduceOnly: true,
    }));

    api.placeOrders({
      accountId: account.id,
      orders,
    });

    return;
  }

  const ticker = Object.values(
    api.store.memory[account.exchange].public.tickers,
  ).find(
    (t) =>
      t.symbol === symbol.toUpperCase() ||
      t.cleanSymbol === symbol.toUpperCase(),
  );

  if (!ticker) {
    onMessage(`Ticker not found: ${symbol}`, CLIMessageSeverity.Error);
    return;
  }

  const position = api.store.memory[account.exchange].private[
    account.id
  ].positions.find((p) => p.symbol === ticker.symbol);

  if (!position) {
    onMessage(`Position not found: ${symbol}`, CLIMessageSeverity.Error);
    return;
  }

  api.placeOrder({
    accountId: account.id,
    order: {
      symbol: position.symbol,
      side:
        position.side === PositionSide.Long ? OrderSide.Sell : OrderSide.Buy,
      type: OrderType.Market,
      amount: position.contracts,
      reduceOnly: true,
    },
  });
};

export const closePositionHelp = `
  Close a position

  Usage:
    ${CLICommands.Close} [accountId] [symbol | all]

  Examples:
    ${CLICommands.Close} main btc
    ${CLICommands.Close} sub all
`;
