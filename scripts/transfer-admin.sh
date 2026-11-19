#!/usr/bin/env bash
# Move DEFAULT_ADMIN_ROLE and PAUSER_ROLE on all four SkillProof contracts from the deployer
# wallet to the new admin (an Agentic Wallet that holds an Agent ID). BNB Smart Chain mainnet only.
#
# Safe order: grant to the new admin first, verify, then revoke from the old admin.
# Usage:
#   cast wallet import attested-deployer --interactive   # once; paste the deployer key yourself
#   NEW_ADMIN=0x... ./scripts/transfer-admin.sh
set -euo pipefail
: "${NEW_ADMIN:?set NEW_ADMIN to the Agentic Wallet address}"
RPC="${BSC_MAINNET_RPC_URL:-https://bsc-dataseed.bnbchain.org}"
OLD_ADMIN="${OLD_ADMIN:-0xF9642B695D4DDf58599c953a791F94c2e96b6a57}"
ACCOUNT="${DEPLOYER_ACCOUNT:-attested-deployer}"
PW_ARGS=()
if [[ -n "${KEYSTORE_PASSWORD_FILE:-}" ]]; then PW_ARGS=(--password-file "$KEYSTORE_PASSWORD_FILE"); fi
CHAIN=$(cast chain-id --rpc-url "$RPC")
[[ "$CHAIN" == "56" ]] || { echo "refusing: RPC is chain $CHAIN, need 56"; exit 1; }
[[ "$(cast call 0x60b9262456de011f7d15a54cdd8c48baaa8b022f 'balanceOf(address)(uint256)' "$NEW_ADMIN" --rpc-url "$RPC")" != "0" ]] \
  || { echo "refusing: $NEW_ADMIN does not hold an Agent ID"; exit 1; }
ADMIN_ROLE=0x0000000000000000000000000000000000000000000000000000000000000000
PAUSER_ROLE=$(cast keccak PAUSER_ROLE)
CONTRACTS=(
  0xDaf663BF05701b509067cE2341B11FFbc227C9B9  # SkillProfileRegistry
  0x2D3d33263DdC5c117ddCC0238DE6C313021a2f7F  # ProjectEvidenceRegistry
  0x713B02D4539F1D9EB60123C68cbf0D9fFA83612c  # SkillAttestation
  0x209f0E30e1aec3470fF41a8fC67b0351f51a5433  # CredentialRegistry
)
echo "== 1/3 grant to $NEW_ADMIN"
for c in "${CONTRACTS[@]}"; do
  for role in $ADMIN_ROLE $PAUSER_ROLE; do
    cast send "$c" 'grantRole(bytes32,address)' "$role" "$NEW_ADMIN" --account "$ACCOUNT" "${PW_ARGS[@]}" --rpc-url "$RPC" >/dev/null
    echo "  granted $role on $c"
  done
done
echo "== 2/3 verify the new admin holds the roles"
for c in "${CONTRACTS[@]}"; do
  a=$(cast call "$c" 'hasRole(bytes32,address)(bool)' "$ADMIN_ROLE" "$NEW_ADMIN" --rpc-url "$RPC")
  p=$(cast call "$c" 'hasRole(bytes32,address)(bool)' "$PAUSER_ROLE" "$NEW_ADMIN" --rpc-url "$RPC")
  echo "  $c admin=$a pauser=$p"
  [[ "$a" == "true" && "$p" == "true" ]] || { echo "verification failed on $c; old admin left in place"; exit 1; }
done
echo "== 3/3 revoke from the old admin (pauser first: admin rights are needed to revoke either role)"
for c in "${CONTRACTS[@]}"; do
  for role in $PAUSER_ROLE $ADMIN_ROLE; do
    cast send "$c" 'revokeRole(bytes32,address)' "$role" "$OLD_ADMIN" --account "$ACCOUNT" "${PW_ARGS[@]}" --rpc-url "$RPC" >/dev/null
    echo "  revoked $role from old admin on $c"
  done
done
echo "done: $NEW_ADMIN is now the only admin and pauser"
