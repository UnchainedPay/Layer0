# layer0-interop (EVM ↔ EVM) — runnable MVP repo

A **runnable** (local) MVP showing the full *shape* of a Layer0-style interop hub:
- **2 EVM chains** (Anvil): Chain A + Chain B
- **Hub** (Node/TS): stores packets in **SQLite**, assigns ordered `hubSeq`
- **Relayer** (Node/TS): watches Chain A events, submits to Hub, then delivers to Chain B
- **Contracts** (Hardhat): `PacketSender`, `PacketReceiver` (replay protection + hub attestation placeholder)

## Quick start

Prereqs: Docker + Docker Compose

```bash
docker compose up --build
```

Endpoints:
- Chain A: http://localhost:8545  (chainId 31337)
- Chain B: http://localhost:9545  (chainId 31338)
- Hub:     http://localhost:7000  (health: /health)

## Send a cross-chain message

```bash
docker compose exec relayer node /app/scripts/send.js "Hello from Chain A"
```

## Check received on Chain B

```bash
docker compose exec relayer node /app/scripts/checkB.js
```

## What is “real” vs “placeholder” here?

✅ Real:
- external relayer (permissionless)
- persistence (SQLite)
- ordered hub sequence (single sequencer)
- replay protection on Chain B
- message format + commitments

🚧 Placeholder (upgrade later):
- full light-client verification on-chain
- merkle proofs of inclusion
- BFT consensus for hub ordering (multi-node)

See `specs/protocol.md`.
