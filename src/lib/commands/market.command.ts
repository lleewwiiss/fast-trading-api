import { CLIMessageSeverity, type CLICommandArgs } from "./commands.types";

import { OrderSide, OrderType } from "~/types/lib.types";
import { pFloat } from "~/utils/p-float.utils";

const checks = ({ api, onMessage, args }: CLICommandArgs) => {
  const [accountId, symbol, amountString] = args;

  if (!accountId) {
    onMessage("Account ID is required", CLIMessageSeverity.Error);
    return;
  }

  if (!amountString) {
    onMessage("Amount is required", CLIMessageSeverity.Error);
    return;
  }

  if (!symbol) {
    onMessage("Symbol is required", CLIMessageSeverity.Error);
    return;
  }

  const account = api.accounts.find((a) => a.id === accountId);

  if (!account) {
    onMessage("Account not found", CLIMessageSeverity.Error);
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
    onMessage("Ticker not found", CLIMessageSeverity.Error);
    return;
  }

  let amount = pFloat(amountString.replace(/\$|k/g, ""));

  if (amountString.startsWith("$") && amountString.endsWith("k")) {
    amount = (amount * 1000) / ticker.last;
  } else if (amountString.startsWith("$")) {
    amount = amount / ticker.last;
  }

  if (isNaN(amount)) {
    onMessage(`Invalid amount: ${amountString}`, CLIMessageSeverity.Error);
    return;
  }

  return { symbol: ticker.symbol, amount, accountId };
};

export const longCommand = ({ api, onMessage, args }: CLICommandArgs) => {
  const output = checks({ api, onMessage, args });
  if (!output) return;

  api.placeOrder({
    accountId: output.accountId,
    priority: true,
    order: {
      symbol: output.symbol,
      amount: output.amount,
      type: OrderType.Market,
      side: OrderSide.Buy,
      reduceOnly: false,
    },
  });
};

export const shortCommand = ({ api, onMessage, args }: CLICommandArgs) => {
  const output = checks({ api, onMessage, args });
  if (!output) return;

  api.placeOrder({
    accountId: output.accountId,
    priority: true,
    order: {
      symbol: output.symbol,
      amount: output.amount,
      type: OrderType.Market,
      side: OrderSide.Sell,
      reduceOnly: false,
    },
  });
};

export const printMarketOrderHelp = (verb: "long" | "short") => {
  return `
    Execute ${verb} order

    Usage:
      ${verb} [accountId] [symbol] [amount]

    Examples:
      ${verb} sub btc 0.1
      ${verb} sub btc $500
      ${verb} main btc $100k
  `;
};
