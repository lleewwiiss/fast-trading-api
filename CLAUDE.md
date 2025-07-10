# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
bun run dev         # Watch mode development
bun run build       # Build for production
bun run test        # Run all tests
bun run lint        # Run ESLint and TypeScript checks
```

### Linting
```bash
bun run lint:eslint # Run ESLint only
bun run lint:tsc    # Run TypeScript compiler check only
```

### Production
```bash
bun run start       # Run the built application
```

## Architecture

This is a high-performance multi-threaded JavaScript/TypeScript library for cryptocurrency exchange trading APIs. Key architectural concepts:

### Multi-threaded Design
- Each exchange runs in a dedicated Web Worker thread to avoid blocking the main thread
- Communication between main thread and workers uses message passing
- Workers handle all CPU-intensive operations and network requests

### Exchange Abstraction
- `BaseExchange` class provides common functionality across all exchanges
- Exchange-specific implementations inherit from base and override methods as needed
- Current exchanges: Bybit, Binance, Hyperliquid, and Onchain (DEX)
- All exchanges expose a unified interface for trading operations

### State Management
- Centralized store system (`store.lib.ts`) manages exchange and account data
- Memory store implementation with change tracking for reactive updates
- Each exchange worker maintains its own state and syncs with the main thread

### WebSocket Architecture
- Each exchange has separate WebSocket implementations for public and private data
- Auto-reconnection logic built into WebSocket connections
- Real-time updates for tickers, order books, candles, and account data

### Type System
- Strict TypeScript with path aliases (`~/` maps to `src/`)
- Exchange-specific types extend base types
- Comprehensive type definitions for all API operations

### Key Classes
- `FastTradingApi`: Main entry point that orchestrates multiple exchanges
- `BaseExchange`: Abstract base class for all exchange implementations
- `BaseWorker`: Base worker implementation handling message routing
- `Store`: State management for exchange data

### Worker Communication Pattern
Workers communicate with the main thread using a message-based protocol:
- Commands are sent from main thread to workers
- Workers emit events back to main thread
- All data is serialized/deserialized when crossing thread boundaries

### Rate Limiting
Built-in rate limiter utility manages API call frequency to respect exchange limits.

## Development Guidelines

When implementing new features or exchanges:
1. Follow the existing exchange implementation pattern (see Bybit or Binance as examples)
2. Implement both REST API and WebSocket connections
3. Ensure all operations are type-safe
4. Handle errors gracefully with proper event emission
5. Test worker communication thoroughly
6. Use the existing utility functions for common operations

When debugging:
- Worker errors may not appear in main thread console
- Use the log event system for debugging worker operations
- Check both main thread and worker thread for errors