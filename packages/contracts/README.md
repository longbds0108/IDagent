# SkillProof contracts

Solidity 0.8.24 · OpenZeppelin 5.1 · Foundry. See the root README and `docs/`.

```bash
forge build
forge test                       # unit + fuzz
BSC_MAINNET_RPC_URL=... forge test --match-contract ForkTest -vv   # real Agent ID on chain 56
```

- `src/AgentIdGate.sol`: `balanceOf > 0` eligibility against the official Agent ID contract (fails closed)
- `src/SkillProfileRegistry.sol`, `src/ProjectEvidenceRegistry.sol`, `src/SkillAttestation.sol`, `src/CredentialRegistry.sol`
- `script/Deploy.s.sol`: mainnet-only deploy with chain-id and Agent ID bytecode assertions
- `deployments/56.json`: live addresses
