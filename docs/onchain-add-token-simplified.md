## Simplified Onchain “Add Token” Flow (Design)

Goal

- Allow users to add a token to tracking with only:
  - tokenAddress (contract/mint)
  - codexNetworkId (Codex network identifier)
- Worker resolves all other details using Codex and existing mappings.

Why

- Avoid requiring chain/networkName inputs in the UI.
- Use Codex as the source of truth per network; remove guesses.

Public API

- FastTradingApi.addTokenToTracking({
  - exchangeName: ExchangeName.ONCHAIN
  - tokenAddress: string
  - codexNetworkId: number
    })

Worker Message Shape

- type: "addTokenToTracking"
- requestId: string
- tokenAddress: string
- codexNetworkId: number

Implementation Plan

1. Update Types and Base Worker

- In base.types.ts:
  - Change addTokenToTracking variant to only include requestId, tokenAddress, codexNetworkId.
- In base.worker.ts:
  - Update abstract addTokenToTracking signature to match.

2. OnchainWorker.addTokenToTracking

- New signature:
  - ({ requestId, tokenAddress, codexNetworkId })
- Steps:
  1. Validate this.codexSdk is available; return false if not.
  2. If token already tracked in memory.public.markets, return true.
  3. Query Codex FilterTokens:
     - codexSDK.queries.filterTokens({
       phrase: tokenAddress,
       limit: 1,
       filters: { network: [codexNetworkId] }
       })
  4. Validate match:
     - Ensure results[0] exists and tokenInfo.token.address (EVM) or mint (SOLANA) matches tokenAddress.
  5. Map codexNetworkId -> chainType and networkName:
     - Use existing lifiChains (stored in worker) to find the chain with a matching codex ID (or existing mapping utility).
     - Derive:
       - chainType: "EVM" | "SOLANA"
       - networkName: e.g., "polygon", "ethereum", "solana"
  6. Fetch full token market/ticker using existing resolver:
     - fetchTokenData({
       phrase: tokenAddress,
       chainType,
       chains: this.lifiChains,
       codexSDK: this.codexSdk,
       codexNetworkId,
       networkName,
       native: false
       })
  7. If tokenData present, merge:
     - memory.public.markets[tokenData.market.id] = tokenData.market
     - memory.public.tickers[tokenData.ticker.id] = tokenData.ticker
     - emitChanges to update store
     - emitResponse({ requestId, data: true })
     - Else, log and emitResponse({ requestId, data: false })

3. FastTradingApi Helper

- Update addTokenToTracking helper:
  - Input: { exchangeName, tokenAddress, codexNetworkId }
  - Call ex.dispatchWorker({ type: "addTokenToTracking", tokenAddress, codexNetworkId })

4. Next.js Example (UI)

- Simplify Onchain “Add Token” panel:
  - Inputs:
    - Token address (string)
    - Codex network id (number)
  - Button calls:
    - api.addTokenToTracking({ exchangeName: ExchangeName.ONCHAIN, tokenAddress, codexNetworkId })

Behavior Summary

- No need to select chain/networkName.
- Codex FilterTokens ensures the token is resolved in the provided network.
- Existing fetchTokenData and mapping logic guarantee consistent markets/tickers.

Edge Cases

- No match found in FilterTokens for given tokenAddress + codexNetworkId:
  - Log “Could not fetch data for token …” and return false.
- Multiple tokens (rare given exact address search + limit: 1):
  - Accept the first result; validation ensures address matches.
- Codex rate limits:
  - Existing retryWithBackoff in fetchTokenData covers follow-up fetch; FilterTokens query should be lightweight.

Testing

- Unit:
  - Mock codexSDK.queries.filterTokens to return EVM and SOLANA token results; validate mapping and success path.
  - Validate failure when no results returned.
- Manual (Next.js example):
  - EVM token address + polygon codexNetworkId -> adds token.
  - SOLANA mint + solana codexNetworkId -> adds token.
  - Invalid pair -> logs and returns false.

Notes

- This design keeps LiFi network coverage broad by using lifiChains and Codex network IDs.
- No hardcoded chain IDs; relies on existing mapping and data sources.
