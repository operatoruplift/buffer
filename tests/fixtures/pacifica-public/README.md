# Pacifica public API fixtures

Captured September 12, 2026, using unauthenticated GET requests to the official mainnet API. Each JSON file records its exact source URL, request start, response completion, and unmodified response envelope. The wallet `Ep1d8JdFw4FnB85XDgXGVabYutro4JzK285HQqW6TZE2` was publicly listed on Pacifica’s leaderboard with privacy mode disabled; no personal identity is asserted.

- `info.json`: 76 perpetual instruments and one SOL-USDC spot instrument.
- `prices.json`: corresponding API oracle prices and response timestamps.
- `positions.json`: 22 open positions in the captured public wallet.
- `account.json`: current API valuation and aggregate order counts at capture.
- `loan.json`: account loan and interest state at capture.

The API server clock was a few seconds ahead of the local capture clock. Tests use the recorded retrieval interval and Buffer’s explicit 10-second tolerance. Position update timestamps represent position changes, not fresh oracle observations. All fixtures are historical and never served as a fallback for live failures.
