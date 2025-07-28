# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Build & Development
- **Build**: `bun run build` - Compiles TypeScript to dist/ with path alias resolution
- **Dev**: `bun run dev` - Runs in watch mode
- **Test**: `bun test` - Runs all tests using Bun's test runner
- **Test specific file**: `bun test src/utils/chunk.utils.test.ts`
- **Lint**: `bun run lint` - Runs both ESLint and TypeScript type checking
- **Type check only**: `bun run lint:tsc` - TypeScript compilation check without emit

### Release
- **Patch release**: `bash release.sh patch` - Bumps patch version, builds, publishes to npm
- **Minor release**: `bash release.sh minor` - Bumps minor version, builds, publishes to npm
- **Major release**: `bash release.sh major` - Bumps major version, builds, publishes to npm

## Architecture Overview

### Core Design Pattern
fast-trading-api is a multi-threaded TypeScript library that provides unified access to multiple cryptocurrency exchanges. Each exchange runs in a dedicated Web Worker to prevent blocking operations.

### Exchange Implementation Structure
Each exchange follows this consistent pattern in `/src/exchanges/{exchange}/`:
- `{exchange}.api.ts` - HTTP client for REST endpoints
- `{exchange}.exchange.ts` - Main exchange class extending BaseExchange
- `{exchange}.worker.ts` - Web Worker implementation
- `{exchange}.ws-private.ts` - Private WebSocket connection (authenticated)
- `{exchange}.ws-public.ts` - Public WebSocket connection (market data)
- `{exchange}.resolver.ts` - Data transformation logic
- `{exchange}.types.ts` - TypeScript type definitions
- `{exchange}.config.ts` - Configuration constants

### Key Components

1. **FastTradingApi** (`/src/lib/fast-trading-api.lib.ts`)
   - Main entry point for library consumers
   - Manages exchange instances and worker lifecycle
   - Provides unified API across all exchanges

2. **Store** (`/src/lib/store.lib.ts`)
   - Central state management for all exchange data
   - Handles cross-exchange data aggregation
   - Manages subscriptions and updates

3. **BaseExchange** (`/src/exchanges/base.exchange.ts`)
   - Abstract base class for all exchange implementations
   - Defines standard interface all exchanges must implement
   - Handles common functionality like worker communication

### Worker Communication Pattern
- Each exchange runs in a Web Worker via `{exchange}.worker.ts`
- Communication via structured message passing
- Prevents UI blocking during heavy computations
- Enables parallel processing across exchanges

### Utility Architecture
The `/src/utils/` directory contains 30+ utility modules, each with:
- Pure functions with single responsibility
- Comprehensive test coverage (`.test.ts` files)
- TypeScript types for all parameters and returns

### Current Migration
The codebase is migrating from private key signing to Privy session signers for enhanced security (see TODO.md). This affects the onchain exchange implementation.

## Exchange-Specific Implementation Details

### Bybit (Centralized Exchange)
**Unique Features:**
- **Hedged Trading**: Supports hedged positions with `positionIdx` (0=both sides, 1=long, 2=short)
- **Dedicated Trading WebSocket**: Separate `bybit.ws-trading.ts` for high-frequency operations
- **Broker ID Integration**: Uses `BROKER_ID` for affiliate tracking
- **Advanced Order Types**: TrailingStop, TPSL (Take Profit Stop Loss) modes, position-specific stops
- **Batch Operations**: Comprehensive batch order placement/cancellation/modification

**Authentication:** HMAC-SHA256 with headers: `X-BAPI-SIGN`, `X-BAPI-API-KEY`, `X-BAPI-TIMESTAMP`, `X-BAPI-RECV-WINDOW`

**Trading Features:**
- Position-specific trading stops with full/partial TPSL modes
- Both linear perpetual and inverse contracts
- Advanced position management with leverage bracketing
- Real-time position updates with detailed margin information

### Binance (Centralized Exchange)
**Unique Features:**
- **Hedge Mode**: Supports both hedge and one-way position modes with `positionSide` (BOTH, LONG, SHORT)
- **Listen Key Authentication**: Rotating listen keys for WebSocket with automatic renewal
- **Rate Limiting**: Sophisticated rate limiting with `binanceRateLimiter`
- **Signature Caching**: Caches API signatures with 5-second TTL
- **Advanced Order Features**: `priceMatch`, `selfTradePreventionMode`, `goodTillDate` parameters

**Authentication:** HMAC-SHA256 with query parameter signatures, listen key system for WebSocket streams

**Trading Features:**
- Leverage bracket system with position-specific maximum leverage
- Dual position mode (hedge/one-way) configuration
- Advanced order matching options (OPPONENT, QUEUE variations)
- Comprehensive market data aggregation from multiple endpoints

### Hyperliquid (Decentralized Exchange)
**Unique Features:**
- **Ethereum-based DEX**: Uses Ethereum wallet addresses and private keys
- **Native USDC Settlement**: All positions settle in USDC only
- **Vault Address Support**: Supports both direct wallet and vault addresses
- **Precision Constraints**: Uses `HL_MAX_DECIMALS` (6) and `HL_MAX_FIGURES` (5) for order sizing
- **Action-Based API**: Uses `HLAction` for order placement, cancellation, modification
- **Cross/Isolated Margin**: Supports both margin modes per asset

**Authentication:** Ethereum wallet signatures using private keys, no traditional API keys

**Trading Features:**
- Built-in leverage adjustment per asset
- TPSL (Take Profit Stop Loss) grouping for position management
- Real-time order book and trade data via WebSocket
- Native support for both limit and trigger orders
- Integrated funding rate and mark price feeds

### Onchain (Multi-Chain DEX Aggregator)
**Unique Features:**
- **Multi-Chain Support**: Supports both EVM and Solana chains via LiFi SDK
- **Privy Authentication**: Uses Privy identity tokens for wallet authentication
- **Cross-Chain Swaps**: Leverages LiFi SDK for cross-chain token swaps and bridging
- **Codex Integration**: Uses Codex SDK for market data, price feeds, transaction history
- **Dynamic Market Discovery**: Automatically discovers tokens and markets across chains
- **DEX Aggregation**: Aggregates liquidity from multiple DEXs (Uniswap, PancakeSwap, Raydium, etc.)

**Authentication:** Privy identity tokens with JWT verification, session-based authentication

**Trading Features:**
- Cross-chain token tracking across multiple blockchains
- Dynamic market types (LIFI, Meteora, Raydium, Pump, PumpSwap)
- Real-time price feeds via Codex
- Comprehensive position tracking with realized/unrealized P&L across chains
- OHLCV data fetching for technical analysis

### CEX vs DEX Comparison

**Centralized Exchanges (Bybit, Binance):**
- Traditional API key authentication with HMAC signatures
- Margin trading with leverage and advanced order types
- Real-time WebSocket feeds for orders, positions, market data
- Rate limiting and signature-based security
- Support for both spot and futures trading

**Decentralized Exchanges (Hyperliquid, Onchain):**
- Wallet-based authentication (private keys, identity tokens)
- On-chain settlement and execution
- Limited to available liquidity pools
- Cross-chain capabilities (especially Onchain)
- Transactions are either executed or pending (no traditional "orders")
- Integration with multiple blockchain networks and protocols

## TypeScript Configuration

### Path Aliases
- `~/` maps to `./src/` - Use this in all imports
- Example: `import { chunk } from "~/utils/chunk.utils"`

### Strict Mode
- TypeScript strict mode is enabled
- All code must be fully typed
- No implicit any types allowed

## Testing Approach

### Test Structure
- Tests are co-located with source files (`.test.ts`)
- Use Bun's test runner with `describe`, `test`, `expect`
- Tests excluded from production build via `tsconfig.build.json`

### Running Tests
- All tests: `bun test`
- Specific file: `bun test path/to/file.test.ts`
- Pattern matching: `bun test src/utils`

## Code Style Guidelines

### Import Order (enforced by ESLint)
1. External dependencies
2. Internal imports with path alias (`~/`)
3. Relative imports
4. Type imports last

### Exchange-Specific Patterns
- All exchange classes extend BaseExchange
- Must implement standard interface methods
- Data transformations handled in resolver classes
- WebSocket connections split between public/private

### Error Handling
- Use typed errors from exchange configs
- Implement retry logic for network operations
- Transform exchange-specific errors to standard format