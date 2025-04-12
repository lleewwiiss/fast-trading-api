# fast-trading-api

![image](./banner.png)

A high-performance multi-threaded JavaScript/TypeScript library for interacting with cryptocurrencies exchanges trading APIs.

## Features

- 🚀 Fast and efficient API connections to popular exchanges
- 🔄 Real-time market data with WebSocket support
- 🧩 Type-safe API with TypeScript support
- 📊 Access to market tickers, orderbooks, and trading functionality
- ⚡ Platform-agnostic - works on server & browser

## Installation

```bash
npm install --save fast-trading-api
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

api.on("log", (message) => console.log(message));
api.on("error", (error) => console.warn(error));

await api.start();
```

## Architecture

The `fast-trading-api` library is designed with performance and flexibility in mind:

### Multi-threaded Design

- **Main Thread Protection**: The architecture isolates complex operations from the main thread, ensuring the UI you are building remains responsive.
- **Web Worker Powered**: Each exchange instance launches a dedicated web worker, moving CPU-intensive tasks off the main thread.
- **Parallel Processing**: Data transformations, calculations, and network operations run in separate threads.

### Exchange Management

- **Dynamic Initialization**: The `FastTradingApi` class automatically initializes appropriate exchange handlers based on your configured accounts.
- **Multiple Account Support**: A single exchange type can manage multiple accounts (e.g., multiple Bybit accounts with different API keys).
- **Unified Interface**: All exchanges expose the same methods, making it easy to work with multiple platforms.


### Data Flow

```
  Application Layer         Exchange Layer            Worker Layer
+------------------+      +-----------------+      +-----------------+
|                  |      |                 |      |                 |
|  FastTradingApi  |----->| Exchange Client |----->|   Web Worker    |
|                  |      |                 |      |                 |
+------------------+      +-----------------+      +-----------------+
         |                         |                       |
         |                         |                       v
         v                         |               +-----------------+
+------------------+               |               |                 |
|                  |               |               |  WebSocket/REST |
|   Memory Store   |<--------------+               |   API Clients   |
|                  |                               |                 |
+------------------+                               +-----------------+
                                                           |
                                                           v
                                                   +-----------------+
                                                   | Worker results  |
                                                   | flow back to    |
                                                   | Exchange Client |
                                                   | which updates   |
                                                   | Memory Store    |
                                                   +-----------------+
```


This architecture allows for:
- Real-time data processing without blocking the UI
- Efficient handling of high-frequency trading operations
- Seamless connection to multiple exchanges and accounts simultaneously
