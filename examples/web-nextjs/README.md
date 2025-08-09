# Fast Trading API - Next.js Integration Test

This is a Next.js app that demonstrates browser integration testing for the Fast Trading API.

## Features

- **Complete Integration Test**: Tests all 5 exchanges (Bybit, Hyperliquid, Polymarket, and 2 Onchain accounts)
- **Real-time Status Updates**: Shows the status of each exchange as markets and tickers load
- **CORS Configuration**: Properly configured for Polymarket API calls
- **Privy Integration**: Configured for onchain account authentication
- **Live Logging**: Real-time logs of all API operations

## Getting Started

1. **Install dependencies:**
   ```bash
   cd examples/web-nextjs
   bun install
   ```

2. **Build the main library first:**
   ```bash
   cd ../..
   bun run build
   ```

3. **Start the development server:**
   ```bash
   cd examples/web-nextjs
   bun run dev
   ```

4. **Open your browser:**
   Navigate to [http://localhost:3334](http://localhost:3334)

5. **Run the test:**
   Click "Start Integration Test" to run the full integration test

## What the Test Validates

✅ **API Initialization** - FastTradingApi starts successfully  
✅ **Exchange Detection** - All 5 exchanges are recognized and configured  
✅ **Credentials** - All account credentials are properly formatted  
✅ **Markets Loading** - Each exchange loads its market data  
✅ **Tickers Loading** - Each exchange loads its ticker data  
✅ **OHLCV Fetching** - Candles can be fetched from each exchange  
✅ **CORS Compatibility** - All API calls work in browser environment  
✅ **Privy Integration** - Onchain accounts authenticate properly  

## Configuration

The test is pre-configured with:
- **Bybit**: Trading account with API credentials
- **Hyperliquid**: Trading account with wallet credentials  
- **Polymarket**: Prediction market account with CORS proxy
- **Onchain (EVM)**: Ethereum wallet with Privy authentication
- **Onchain (Solana)**: Solana wallet with Privy authentication

## Technical Details

- Uses Next.js 14 with App Router
- Properly handles Web Worker limitations in browser
- Implements real-time status updates with React state
- Configures CORS headers for cross-origin API calls
- Bundles fast-trading-api for browser compatibility