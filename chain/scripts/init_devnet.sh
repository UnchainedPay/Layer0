#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVNET="$ROOT/devnet"

echo "[init] creating devnet at: $DEVNET"
rm -rf "$DEVNET"
mkdir -p "$DEVNET"

COMET_IMAGE="ghcr.io/cometbft/cometbft:v0.38.10"

function comet_init () {
  local n="$1"
  local home="$DEVNET/node${n}/comet"
  mkdir -p "$home"
  docker run --rm -v "$home:/comet" "$COMET_IMAGE" init --home /comet >/dev/null
}

for i in 0 1 2 3; do
  comet_init "$i"
  mkdir -p "$DEVNET/node${i}/app"
done

# Build genesis with 4 validators from each node's priv_validator_key.json
GENESIS="$DEVNET/node0/comet/config/genesis.json"
TMPGEN="$DEVNET/genesis.json"
cp "$GENESIS" "$TMPGEN"

CHAIN_ID="layer0-hub-devnet"
jq --arg cid "$CHAIN_ID" '.chain_id=$cid' "$TMPGEN" > "$TMPGEN.tmp" && mv "$TMPGEN.tmp" "$TMPGEN"

# Collect validators
VALIDATORS="[]"
for i in 0 1 2 3; do
  PV="$DEVNET/node${i}/comet/config/priv_validator_key.json"
  PUB=$(jq -r '.pub_key.value' "$PV")
  VALIDATORS=$(echo "$VALIDATORS" | jq --arg v "$PUB" '. + [{"pub_key":{"type":"tendermint/PubKeyEd25519","value":$v},"power":"10","name":"val'${i}'"}]')
done

jq --argjson vals "$VALIDATORS" '.validators=$vals' "$TMPGEN" > "$TMPGEN.tmp" && mv "$TMPGEN.tmp" "$TMPGEN"

# Copy genesis + set persistent peers
NODE0_ID=$(docker run --rm -v "$DEVNET/node0/comet:/comet" "$COMET_IMAGE" show-node-id --home /comet)
NODE1_ID=$(docker run --rm -v "$DEVNET/node1/comet:/comet" "$COMET_IMAGE" show-node-id --home /comet)
NODE2_ID=$(docker run --rm -v "$DEVNET/node2/comet:/comet" "$COMET_IMAGE" show-node-id --home /comet)
NODE3_ID=$(docker run --rm -v "$DEVNET/node3/comet:/comet" "$COMET_IMAGE" show-node-id --home /comet)

# Set distinct monikers and ports for each node by editing config.toml
function set_config () {
  local n="$1"
  local home="$DEVNET/node${n}/comet"
  local cfg="$home/config/config.toml"
  local rpcport=$((26657 + n*10))
  local p2pport=$((26656 + n*10))

  # moniker
  sed -i.bak "s/^moniker = .*/moniker = \\"node${n}\\"/" "$cfg"

  # RPC listen
  sed -i.bak "s#^laddr = \\"tcp://127.0.0.1:26657\\"#laddr = \\"tcp://0.0.0.0:${rpcport}\\"#g" "$cfg"

  # P2P listen
  sed -i.bak "s#^laddr = \\"tcp://0.0.0.0:26656\\"#laddr = \\"tcp://0.0.0.0:${p2pport}\\"#g" "$cfg"

  # faster timeouts for dev
  sed -i.bak 's/^timeout_commit = .*/timeout_commit = "2s"/' "$cfg"

  # allow CORS for easy local queries
  sed -i.bak 's/^cors_allowed_origins = .*/cors_allowed_origins = ["*"]/' "$cfg"
}

for i in 0 1 2 3; do
  cp "$TMPGEN" "$DEVNET/node${i}/comet/config/genesis.json"
  set_config "$i"
done

# Persistent peers (node0 as seed)
PEERS="${NODE0_ID}@node0:26656,${NODE1_ID}@node1:26656,${NODE2_ID}@node2:26656,${NODE3_ID}@node3:26656"
for i in 0 1 2 3; do
  cfg="$DEVNET/node${i}/comet/config/config.toml"
  sed -i.bak "s/^persistent_peers = .*/persistent_peers = \\"${PEERS}\\"/" "$cfg"
done

echo "[init] devnet ready."
echo "Run:"
echo "  cd chain && docker compose up --build"
