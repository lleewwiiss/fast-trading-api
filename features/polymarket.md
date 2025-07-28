## FEATURE:

We want to add a new exchange integration for Polymarket to the `fast-trading-api` library. This will allow users to access Polymarket's prediction markets, retrieve market data, and execute trades through a unified API.
It should follow the same structure as existing exchanges like Bybit, Binance, etc. We need to support:
- Buy/Sell orders
- Market and limit orders
- Retrieving market data (tickers, order books, etc.)
- WebSocket support for real-time updates

## EXAMPLES:
See src/exchanges/bybit for an example of how to implement a new exchange. The Polymarket integration should follow the same patterns and conventions.
See src/hyperliquid for an example of how to implement an exchange with onchain trading capabilities.

## DOCUMENTATION:

https://github.com/Polymarket/polymarket-sdk

## OTHER CONSIDERATIONS:

We only need the features similar to Bybit, if one of th features doesn't apply to Polymarket, we can skip it. Do not add any additional features that are not present in Bybit or other exchanges.