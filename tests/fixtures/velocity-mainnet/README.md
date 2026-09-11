# Velocity mainnet layout fixtures

These small binary captures are public, read-only Velocity mainnet account buffers used to guard the decoder and PDA assumptions in `tests/velocity.test.ts`.

- State: `velocity_state` PDA (`2etx5NvPNxeMZ7EfHE6GjJfW2imRYEUANehNS1WB4CVW`)
- Perpetual markets: SOL index 0, BTC index 1, and ETH index 2
- Quote spot market: USDT index 0
- Pyth Lazer oracle buffers for the three perpetual markets

The captures contain protocol market metadata and oracle values only. No user account buffers or credentials are included. They were collected from Solana mainnet-beta on September 12, 2026 and are compatibility fixtures rather than a source of current prices.
