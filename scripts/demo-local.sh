#!/usr/bin/env bash
# Local end-to-end demo on an anvil node with chain id 56 that mirrors the REAL Agent ID contract
# (bytecode + the storage slots it reads for two real holders) from BNB Smart Chain mainnet.
# Nothing is broadcast to the real network. Requires Foundry (anvil, forge, cast) and pnpm.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIRROR="${MIRROR_FILE:-$ROOT/apps/web/.data/agent-id-mirror.json}"
PORT="${ANVIL_PORT:-8545}"
APP_PORT="${APP_PORT:-3000}"
RPC="http://127.0.0.1:${PORT}"
AGENT_ID="${AGENT_ID_CONTRACT_ADDRESS:-0x60b9262456de011f7d15a54cdd8c48baaa8b022f}"
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 # anvil account #0 (well-known public test account, local only)

cleanup() {
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  [[ -n "${ANVIL_PID:-}" ]] && kill "$ANVIL_PID" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$(dirname "$MIRROR")"
if [[ ! -f "$MIRROR" || "${REFRESH_MIRROR:-0}" == "1" ]]; then
  echo "▸ mirroring Agent ID state from BNB Smart Chain mainnet (read-only)"
  (cd "$ROOT/apps/web" && pnpm exec tsx scripts/mirror-agent-id.mts "$MIRROR" 2)
fi

echo "▸ starting local anvil (chain id 56) on :$PORT"
anvil --chain-id 56 --port "$PORT" --silent &
ANVIL_PID=$!
for _ in $(seq 1 60); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 1; done
[[ "$(cast chain-id --rpc-url "$RPC")" == "56" ]] || { echo "local node is not chain 56"; exit 1; }
(cd "$ROOT/apps/web" && FORK_RPC="$RPC" pnpm exec tsx scripts/apply-mirror.mts "$MIRROR")

echo "▸ deploying with the production script (chain-id + Agent ID bytecode assertions)"
cd "$ROOT/packages/contracts"
DEPLOY_CHAIN_ID=56 AGENT_ID_CONTRACT_ADDRESS="$AGENT_ID" DEPLOYMENT_OUT=deployments/local.json \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --unlocked --sender "$DEPLOYER" -q
DEP="$ROOT/packages/contracts/deployments/local.json"
j() { python3 -c "import json;print(json.load(open('$DEP'))['$1'])"; }

cat > "$ROOT/apps/web/.env.local" <<ENV
NEXT_PUBLIC_CHAIN_ID=56
NEXT_PUBLIC_BSC_RPC_URL=$RPC
BSC_MAINNET_RPC_URL=$RPC
BSC_LOGS_RPC_URL=$RPC
NEXT_PUBLIC_EXPLORER_URL=https://bscscan.com
NEXT_PUBLIC_AGENT_ID_ADDRESS=$AGENT_ID
NEXT_PUBLIC_PROFILE_REGISTRY=$(j skillProfileRegistry)
NEXT_PUBLIC_PROJECT_REGISTRY=$(j projectEvidenceRegistry)
NEXT_PUBLIC_ATTESTATION_REGISTRY=$(j skillAttestation)
NEXT_PUBLIC_CREDENTIAL_REGISTRY=$(j credentialRegistry)
NEXT_PUBLIC_DEPLOY_BLOCK=$(j deployBlock)
PUBLIC_APP_URL=http://localhost:$APP_PORT
METADATA_DIR=$ROOT/apps/web/.data/metadata-local
AUTH_SECRET=${AUTH_SECRET:-local-only-demo-secret-0123456789abcdef}
ENV

echo "▸ building and starting web app on :$APP_PORT"
cd "$ROOT/apps/web"
rm -rf .data/metadata-local .data/metadata-local-preferences
pnpm build >/dev/null
pnpm start -p "$APP_PORT" >"${WEB_LOG:-/dev/null}" 2>&1 &
WEB_PID=$!
for _ in $(seq 1 90); do curl -sf "http://localhost:$APP_PORT/api/issuers" >/dev/null && break; sleep 1; done

if [[ "${SKIP_E2E:-0}" != "1" ]]; then
  echo "▸ running end-to-end flows"
  APP_URL="http://localhost:$APP_PORT" FORK_RPC="$RPC" MIRROR_FILE="$MIRROR" pnpm exec tsx scripts/demo-e2e.mts
else
  echo "▸ app ready at http://localhost:$APP_PORT (end-to-end flows skipped)"
fi

if [[ "${KEEP_RUNNING:-0}" == "1" ]]; then
  echo "▸ app running at http://localhost:$APP_PORT (Ctrl+C to stop)"
  wait "$WEB_PID"
fi
