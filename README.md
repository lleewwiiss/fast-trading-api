# fast-trading-api

A high-performance JavaScript/TypeScript library for interacting with cryptocurrency trading APIs.

## Features

- 🚀 Fast and efficient API connections to popular exchanges
- 🔄 Real-time market data with WebSocket support
- 🧩 Type-safe API with TypeScript support
- 📊 Access to market tickers, orderbooks, and trading functionality
- ⚡ Platform-agnostic - works on server & browser

## Installation

```bash
# Using npm
npm install fast-trading-api

# Using yarn
yarn add fast-trading-api

# Using pnpm
pnpm add fast-trading-api

# Using bun
bun add fast-trading-api
```

## Quick Start

```ts
import { FastTradingApi } from 'fast-trading-api';
import { ExchangeName } from 'fast-trading-api/dist/types/lib.types';

// Initialize the API with your credentials
const api = new FastTradingApi({
  accounts: [
    {
      id: 'main',
      exchange: ExchangeName.BYBIT,
      apiKey: 'XXX',
      apiSecret: 'XXX'
    }
  ]
});
```
