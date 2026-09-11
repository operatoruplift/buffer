# Canonical Drift decoder fixtures

These seven public program/market account buffers were read from Solana mainnet at observed slot **446212035** on 2026-09-11 UTC. Their filenames identify the on-chain addresses. They contain State, three SpotMarket, and three PerpMarket accounts; no user accounts or secrets.

They test external binary-layout compatibility, not current prices. SDK `2.163.0-beta.13` bundled a different program's IDL and could not decode canonical Drift's 776-byte SpotMarket layout. The selected official SDK `2.161.0-beta.5` decodes these buffers and includes isolated collateral in net USD valuation. Future dependency upgrades must keep these compatibility tests passing and repeat a fresh mainnet verification.
