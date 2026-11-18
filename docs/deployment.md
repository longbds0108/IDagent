# Deployment (BNB Smart Chain mainnet, chain 56)

## Current deployment

| Contract | Address | Deploy tx |
|---|---|---|
| SkillProfileRegistry | [`0xDaf663BF05701b509067cE2341B11FFbc227C9B9`](https://bscscan.com/address/0xDaf663BF05701b509067cE2341B11FFbc227C9B9) | [`0xfca7b3…5e28`](https://bscscan.com/tx/0xfca7b312eddf66b78ff9ca610c01b59c1f9ef303d0b585077eaeb2d145015e28) |
| ProjectEvidenceRegistry | [`0x2D3d33263DdC5c117ddCC0238DE6C313021a2f7F`](https://bscscan.com/address/0x2D3d33263DdC5c117ddCC0238DE6C313021a2f7F) | [`0x1346b5…465f`](https://bscscan.com/tx/0x1346b5486bf7e757c297a0dba699009d5c51f9e9ca48118dfbd562545e13465f) |
| SkillAttestation | [`0x713B02D4539F1D9EB60123C68cbf0D9fFA83612c`](https://bscscan.com/address/0x713B02D4539F1D9EB60123C68cbf0D9fFA83612c) | [`0x4944b3…1134`](https://bscscan.com/tx/0x4944b31cda79e3b20aba11f3110ad13fae85cc9c4b42dc09e32f9c61fe071134) |
| CredentialRegistry | [`0x209f0E30e1aec3470fF41a8fC67b0351f51a5433`](https://bscscan.com/address/0x209f0E30e1aec3470fF41a8fC67b0351f51a5433) | [`0x60de66…e48a`](https://bscscan.com/tx/0x60de66506106a25e91f2c475896df1182686cc0ce8537231b97a06fbff7de48a) |

Deploy block 134334098 · admin `0xF9642B695D4DDf58599c953a791F94c2e96b6a57` · Agent ID `0x60b9…022f`.
Source: Sourcify **exact match** for all four. BscScan verification: see below (needs an API key).

## Deploying again

```bash
cd packages/contracts
# 1. dry run: asserts DEPLOY_CHAIN_ID == 56, block.chainid == 56, Agent ID has code and is ERC-721
DEPLOY_CHAIN_ID=56 AGENT_ID_CONTRACT_ADDRESS=0x60b9262456de011f7d15a54cdd8c48baaa8b022f \
  forge script script/Deploy.s.sol --rpc-url $BSC_MAINNET_RPC_URL --account <keystore>
# 2. broadcast after review
... --broadcast --slow
```
Signing comes from the CLI (`--account`, `--ledger`); the script never reads a private key. Set `ADMIN_ADDRESS`
to a multisig to avoid admin on a hot wallet.

## BscScan source verification

Create a free Etherscan API key (it works for BscScan via Etherscan API v2), then:

```bash
export BSCSCAN_API_KEY=...
AG=0x60b9262456de011f7d15a54cdd8c48baaa8b022f AD=0xF9642B695D4DDf58599c953a791F94c2e96b6a57
P=0xDaf663BF05701b509067cE2341B11FFbc227C9B9 J=0x2D3d33263DdC5c117ddCC0238DE6C313021a2f7F
forge verify-contract $P src/SkillProfileRegistry.sol:SkillProfileRegistry --chain 56 --etherscan-api-key $BSCSCAN_API_KEY \
  --constructor-args $(cast abi-encode 'c(address,address)' $AG $AD) --watch
forge verify-contract $J src/ProjectEvidenceRegistry.sol:ProjectEvidenceRegistry --chain 56 --etherscan-api-key $BSCSCAN_API_KEY \
  --constructor-args $(cast abi-encode 'c(address,address,address)' $AG $P $AD) --watch
forge verify-contract 0x713B02D4539F1D9EB60123C68cbf0D9fFA83612c src/SkillAttestation.sol:SkillAttestation --chain 56 --etherscan-api-key $BSCSCAN_API_KEY \
  --constructor-args $(cast abi-encode 'c(address,address,address,address)' $AG $P $J $AD) --watch
forge verify-contract 0x209f0E30e1aec3470fF41a8fC67b0351f51a5433 src/CredentialRegistry.sol:CredentialRegistry --chain 56 --etherscan-api-key $BSCSCAN_API_KEY \
  --constructor-args $(cast abi-encode 'c(address,address)' $P $AD) --watch
```

## Approving an issuer (admin)

From the dashboard (Credentials tab, admin wallet) or:
```bash
CREDENTIAL_REGISTRY=0x209f0E30e1aec3470fF41a8fC67b0351f51a5433 ISSUER_ADDRESS=0x... ISSUER_APPROVED=true \
ISSUER_NAME="Org name" ISSUER_URI=https://org.example \
  forge script script/SetIssuer.s.sol --rpc-url $BSC_MAINNET_RPC_URL --account <admin> --broadcast
```

## Web app (Vercel or any Node host)

1. Copy `.env.example` values into the host's environment.
2. **Set `PUBLIC_APP_URL` to the public https origin** before anyone writes. Metadata URIs anchored on-chain embed it.
   The API refuses to create metadata with a localhost origin while reading mainnet.
3. Set `DATABASE_URL` (Postgres/Supabase). The table `metadata_blobs` is created automatically. Serverless
   filesystems are read-only, so the filesystem store is for local use only.
4. Prefer a private BSC RPC for `BSC_MAINNET_RPC_URL`, and an RPC that allows `eth_getLogs` for `BSC_LOGS_RPC_URL`.
5. Build from the repo root: `pnpm install && pnpm build`, or set the Vercel root directory to `apps/web`.
