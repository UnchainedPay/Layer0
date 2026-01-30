# Layer0 Hub Chain (Commit 1)

This directory adds a **real BFT hub chain**:
- **CometBFT** as consensus (4 validators in local devnet)
- **ABCI app in Go** (token balances, fees, minimal staking, persistence)

## Quick start

```bash
bash scripts/init_devnet.sh
docker compose up --build
```

RPC:
- node0 RPC: http://localhost:26657

## Send a tx (very simple)

We use a minimal JSON tx format:

Transfer:
```json
{"type":"transfer","from":"alice","to":"bob","amount":10,"fee":1}
```

Stake (delegation):
```json
{"type":"delegate","delegator":"alice","validator":"val0","amount":50,"fee":1}
```

Broadcast example:
```bash
curl -s http://localhost:26657/broadcast_tx_commit?tx=\"$(printf '{"type":"transfer","from":"alice","to":"bob","amount":10,"fee":1}' | base64 | tr -d '\n')\"
```

Note: for simplicity, tx bytes are base64(JSON). The app decodes base64 then parses JSON.

## Accounts pre-funded in genesis (app state)

- alice: 1_000_000
- bob:   1_000_000
- treasury: 0

Validators IDs (logical):
- val0, val1, val2, val3

## What’s included vs next

Included now:
- BFT consensus (multi-node)
- persistent app state snapshots
- fees (burn + treasury split)
- minimal staking (delegations)

Next commits:
- slashing conditions
- validator set changes based on stake
- governance (params + upgrades)
