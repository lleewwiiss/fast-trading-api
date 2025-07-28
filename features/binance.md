## FEATURE:

We need to replicate the functionality of the Binance API in our application. This includes fetching market data, managing user accounts, and executing trades.
We have made an attempt to implement the Binance API in our `fast-trading-api` library, but it needs to be completed and tested.

## EXAMPLES:

Here is an example of how the forked library attempted it. https://github.com/iam4x/fast-trading-api/tree/binance/src/exchanges/binance

it should replicate src/exchanges/bybit in functionality

## DOCUMENTATION:

The Binance API documentation can be found here: https://binance-docs.github.io/apidocs/spot/en/#public-rest-api

## OTHER CONSIDERATIONS:

- Ensure that the implementation adheres to the Binance API rate limits and error handling guidelines.
- Remove any code we added that isn't needed
- Only add the functionality that is needed for our application similar to how the Bybit API is implemented.