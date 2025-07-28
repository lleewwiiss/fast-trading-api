name: "Fast Trading API PRP Template - TypeScript/Web Worker Context-Rich with Validation Loops"
description: |

## Purpose
Template optimized for AI agents to implement features in the fast-trading-api cryptocurrency exchange library with sufficient context and self-validation capabilities to achieve working code through iterative refinement.

## Core Principles
1. **Context is King**: Include ALL necessary documentation, examples, and caveats
2. **Validation Loops**: Provide executable tests/lints the AI can run and fix
3. **Information Dense**: Use keywords and patterns from the codebase
4. **Progressive Success**: Start simple, validate, then enhance
5. **Global rules**: Be sure to follow all rules in CLAUDE.md

---

## Goal
[What needs to be built - be specific about the end state and desires]

## Why
- [Business value and user impact]
- [Integration with existing features]
- [Problems this solves and for whom]

## What
[User-visible behavior and technical requirements]

### Success Criteria
- [ ] [Specific measurable outcomes]

## All Needed Context

### Documentation & References (list all context needed to implement the feature)
```yaml
# MUST READ - Include these in your context window
- url: [Exchange API docs / LiFi SDK docs / Web Worker docs URL]
  why: [Specific sections/methods you'll need]
  
- file: [path/to/exchange.worker.ts or path/to/utils.ts]
  why: [Pattern to follow, gotchas to avoid]
  
- doc: [TypeScript/Bun/Web Worker documentation URL] 
  section: [Specific section about common pitfalls]
  critical: [Key insight that prevents common errors]

- docfile: [CLAUDE.md / TODO.md]
  why: [Project conventions and migration context]

```

### Current Codebase tree (run `tree` in the root of the project) to get an overview of the codebase
```bash

```

### Desired Codebase tree with files to be added and responsibility of file
```bash

```

### Known Gotchas of our codebase & Library Quirks
```typescript
// CRITICAL: [Library name] requires [specific setup]
// Example: Web Workers need proper message passing with structured cloning
// Example: WebSocket connections must handle reconnection logic
// Example: Exchange rate limits require careful request management
// Example: TypeScript path aliases use ~/ for src imports
// Example: Privy session signers replacing private key signing (ongoing migration)
// Example: Each exchange runs in dedicated Web Worker to prevent blocking
```

## Implementation Blueprint

### Data models and structure

Create the core data models, we ensure type safety and consistency.
```typescript
Examples: 
 - Exchange type definitions (exchange.types.ts)
 - Worker message interfaces
 - WebSocket message types
 - Order/Position/Market interfaces
 - Configuration types
 - Resolver transformation types

```

### list of tasks to be completed to fullfill the PRP in the order they should be completed

```yaml
Task 1:
MODIFY src/exchanges/{exchange}/{exchange}.types.ts:
  - FIND pattern: "export interface"
  - ADD new types following existing patterns
  - PRESERVE existing type exports

CREATE src/exchanges/{exchange}/{exchange}.feature.ts:
  - MIRROR pattern from: src/exchanges/{exchange}/{exchange}.api.ts
  - MODIFY for new feature logic
  - KEEP error handling pattern identical

MODIFY src/exchanges/{exchange}/{exchange}.worker.ts:
  - ADD new message handler case
  - FOLLOW existing message passing patterns
  - PRESERVE worker initialization logic

...(...)

Task N:
...

```


### Per task pseudocode as needed added to each task
```typescript
// Task 1 - Worker TypeScript pseudocode
// Pseudocode with CRITICAL details dont write entire code
private async handleNewFeature(params: NewFeatureParams): Promise<NewFeatureResult> {
    // PATTERN: Always validate input first (see utils/validation patterns)
    const validated = this.validateParams(params);
    if (!validated.success) {
        throw new Error(`Validation failed: ${validated.error}`);
    }
    
    // GOTCHA: Exchange API requires rate limiting
    await this.rateLimiter.wait(); // see utils/rate-limiter.utils.ts
    
    // PATTERN: Use existing retry logic with exponential backoff
    const result = await retryWithBackoff(async () => {
        // CRITICAL: API returns specific error codes for rate limits
        return this.api.makeRequest(validated.data);
    }, this.config.retry);
    
    // PATTERN: Transform response using resolver
    return this.resolver.transformFeature(result); // see {exchange}.resolver.ts
}
```

```typescript
// Task 2 - Exchange Class TypeScript pseudocode
// Pseudocode with CRITICAL details dont write entire code
export class NewExchangeFeature extends BaseExchange {
    // PATTERN: Dispatch to worker with proper typing
    async executeFeature(params: FeatureParams): Promise<FeatureResult> {
        const requestId = genId();
        
        // PATTERN: Use dispatchWorker for all worker communication
        return this.dispatchWorker({
            type: 'executeFeature',
            requestId,
            params,
        });
    }
    
    // PATTERN: Handle WebSocket subscriptions
    subscribeToFeature(symbol: string, callback: (data: FeatureData) => void) {
        const listenerId = `${symbol}-feature`;
        this.featureListeners.set(listenerId, callback);
        
        // Dispatch subscription to worker
        this.worker.postMessage({
            type: 'subscribeFeature',
            symbol,
        });
    }
}
```

### Integration Points
```yaml
EXCHANGE_CONFIG:
  - add to: src/exchanges/{exchange}/{exchange}.config.ts
  - pattern: "export const FEATURE_CONFIG = { ... }"
  
TYPES:
  - add to: src/types/lib.types.ts (if needed for cross-exchange)
  - pattern: "export interface NewFeature { ... }"
  
STORE:
  - add to: src/lib/store.lib.ts (if state management needed)
  - pattern: "featureData: Record<string, FeatureData>"
  
WEBSOCKET:
  - add to: src/exchanges/{exchange}/{exchange}.ws-private.ts or ws-public.ts
  - pattern: "Handle feature-specific WebSocket messages"
  
WORKER_MESSAGES:
  - add to: src/exchanges/{exchange}/{exchange}.worker.ts
  - pattern: "case 'featureAction': { ... }"
```

## Validation Loop

### Level 1: Syntax & Style
```bash
# Run these FIRST - fix any errors before proceeding
bun run lint:tsc  # TypeScript type checking only
bun run lint      # Full ESLint + TypeScript check
bun test          # Run Bun tests

# Build check
bun run build     # Ensure it compiles to dist/

# Expected: No errors. If errors, READ the error and fix.
```

### Level 2: Unit Tests each new feature/file/function use existing test patterns
```typescript
// CREATE src/exchanges/{exchange}/new-feature.test.ts with these test cases:
import { describe, test, expect } from "bun:test";

describe("NewFeature", () => {
  test("should handle happy path", async () => {
    // Basic functionality works
    const result = await feature.execute({ symbol: "BTC-USD" });
    expect(result.status).toBe("success");
    expect(result.data).toBeDefined();
  });

  test("should handle validation errors", async () => {
    // Invalid input returns error
    await expect(feature.execute({ symbol: "" })).rejects.toThrow("validation failed");
  });

  test("should handle rate limit errors", async () => {
    // Handles rate limiting gracefully
    // Mock API to return rate limit error
    await expect(feature.execute({ symbol: "BTC-USD" })).rejects.toThrow("rate limit");
  });
});
```

```bash
# Run and iterate until passing:
bun test src/exchanges/{exchange}/new-feature.test.ts
# If failing: Read error, understand root cause, fix code, re-run (never mock to pass)
```

### Level 3: Integration Test
```bash
# Build the library
bun run build

# Test via example script
cat > test-feature.ts << 'EOF'
import { FastTradingApi } from './dist/index.js';
import { ExchangeName } from './dist/types/lib.types.js';

const api = new FastTradingApi({
  accounts: [{
    id: 'test',
    exchange: ExchangeName.BYBIT,
    apiKey: 'test',
    apiSecret: 'test'
  }]
});

api.on("log", console.log);
api.on("error", console.error);

await api.start();
// Test your feature here
EOF

bun run test-feature.ts

# Expected: Feature executes successfully
# If error: Check worker logs and error messages
```

## Final validation Checklist
- [ ] All tests pass: `bun test`
- [ ] No linting errors: `bun run lint`
- [ ] No type errors: `bun run lint:tsc`
- [ ] Build successful: `bun run build`
- [ ] Manual test successful: [specific test script or example]
- [ ] Error cases handled gracefully
- [ ] Worker message handling correct
- [ ] WebSocket connections work properly (if applicable)
- [ ] Rate limiting respected
- [ ] Types exported correctly in index files
- [ ] Documentation updated if needed

---

## Anti-Patterns to Avoid
- ❌ Don't create new patterns when existing ones work
- ❌ Don't skip validation because "it should work"
- ❌ Don't ignore failing tests - fix them
- ❌ Don't block the main thread - use Web Workers
- ❌ Don't hardcode values that should be in config
- ❌ Don't use 'any' type - be specific with TypeScript types
- ❌ Don't forget to handle WebSocket reconnection logic
- ❌ Don't bypass exchange API rate limiting
- ❌ Don't mix private key logic with Privy session signers
- ❌ Don't forget path aliases use ~/ for src imports
- ❌ Don't access worker properties directly - use message passing