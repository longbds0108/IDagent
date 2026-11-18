# Agent ID integration: verified facts, design decisions, conflicts

Checked on 2026-11-18 against the official Binance pages and directly on BNB Smart Chain mainnet.

## Verified facts

| Fact | Source / how verified |
|---|---|
| Agent ID contract on BSC (chain 56): `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` | Hackathon announcement "Developer Resources" table, plus on-chain checks |
| `name()` = "SPACE ID Agent ID", `symbol()` = "AI" | `eth_call` on chain 56 |
| ERC-165 reports ERC-721 (`0x80ac58cd`) but **not** ERC721Enumerable (`0x780e9d63`) | `supportsInterface` on chain 56 |
| Holder check: `balanceOf(address) > 0` | Announcement (the only documented function) |
| Non-transferable, one per user, claimed only in the Binance App | Announcement |
| `tokenId == uint256(keccak256(bytes(label)))` for `label.ai` | **Observed**: 311/311 mints in a 5,000-block window matched; also fork-tested |
| `tokenURI(id)` = `https://agentid.prd.space.id/metadata/<label>.json` | `eth_call` on chain 56 |
| Agentic Wallet signs only via the agent CLI: `baw contract-call preview/execute` (Developer Mode), EIP-712 only for messages; `personal_sign`/SIWE unsupported | Agentic Wallet docs (Developer Mode, Security Model) |
| No documented injected provider / WalletConnect for Agentic Wallet | Agentic Wallet docs (absence of documentation) |
| Hackathon red line: no QR / pairing-code login on third-party sites, no server-side sessions | Announcement |

## Where Agent ID gates each core action

| Action | Contract | Check (on-chain) |
|---|---|---|
| `createProfile` | SkillProfileRegistry | `agentId.balanceOf(msg.sender) > 0`; optional `.ai` label checked with `agentId.ownerOf(keccak256(label)) == msg.sender`; one profile per address and per Agent ID token |
| `updateProfile`, `bindAgentLabel` | SkillProfileRegistry | Agent ID holder and profile owner |
| `addProject`, `supersedeProject` | ProjectEvidenceRegistry | Agent ID holder and owner of the target profile |
| `attest` | SkillAttestation | Agent ID holder; not the subject; target project active and owned by subject; no duplicate active `(issuer, profile, project, skill)` |
| `revokeProject`, `revokeAttestation` | both | **Not** gated: creators can always retract their own statements |
| `issueCredential` | CredentialRegistry | Admin-approved issuer allowlist (organizations need not hold an Agent ID); subject must have a profile, which itself required an Agent ID |

The gate fails closed: if the Agent ID call reverts, the account is treated as ineligible.

## Name resolution

SkillProof does **not** use a reverse lookup API. A builder may *bind* their own `label.ai` at registration; the
registry verifies ownership on-chain with `ownerOf`. Public URLs such as `/p/alice.ai` resolve only labels that were
bound on SkillProof by their owner, so SkillProof is not a general name-to-wallet lookup tool (a hackathon rule).

## Wallet changes

Agent IDs are non-transferable, so the owner address is the durable identity. The profile stores the token id when
a label is bound. If an address ever stops holding an Agent ID, its records remain visible but it can no longer
create, update or attest. The public profile shows "Agent ID held now: No".

## Conflicts with the original spec (and what we did)

1. **"Connect a supported wallet" (Flow A)**: Agentic Wallet has no documented dApp connector, and the hackathon
   forbids third-party QR/pairing logins. → The dashboard offers **(A) Agentic Wallet via the user's own AI agent**:
   the site prepares calldata and a `baw contract-call preview` command, the user's agent runs it, and the user
   confirms in the Binance App. A pasted tx hash is checked against the expected sender, contract and calldata before
   it is tracked. **(B) Browser wallets** (EIP-1193/EIP-6963 injected) cover issuers, admins, and any holder who uses
   one. WalletConnect is deliberately not included.
2. **"Store token ID if reliable/officially retrievable"**: the contract is not Enumerable, so token id comes from
   the user-supplied label, verified on-chain. This is optional; profiles work with `balanceOf` alone.
3. **"Indexer + DB"**: the MVP reads canonical state straight from the contracts (paginated views + multicall) and
   finds transaction hashes with a single-block `eth_getLogs` keyed by the block number stored in every record. No
   derived DB can disagree with the chain. Off-chain storage holds only content-addressed metadata JSON.
4. **Public RPC limits**: `bsc-dataseed` rejects `eth_getLogs`, so `BSC_LOGS_RPC_URL` is configurable.

## Not established

Agent ID is not proof of personhood or uniqueness. Peer attestations prove who signed, not truth. Credentials prove
issuance by an approved issuer, not factual infallibility.
