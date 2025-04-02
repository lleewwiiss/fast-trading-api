# FastTradingApi

- Entrypoint
- Can be passed a store implementation
- Don't need store listeners

# Store

- Has a method to apply changes

```
public applyChanges(changes: {path: string; value: any}[]) {
  updateObjectPath(this.memory, path, value)
}
```

- Has a default schema to be shared for other implementations
- Expose plan `this.memory`
- Should start ASAP

# Worker

- One worker per exchange
- Handle multiple exchange accounts
- UI data must be computed from an account view
- Should hold in memory state of the exchange + accounts to calculate UI derrived data
- Only send messages to `updateObjectPath` when data is computed
