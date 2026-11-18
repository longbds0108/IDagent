/** Human-readable explanations for SkillProof custom errors (shown on revert). */
export const REVERT_MESSAGES: Record<string, string> = {
  NotAgentIdHolder:
    'This wallet does not hold an Agent ID on BNB Smart Chain. Claim one in the Binance App (Wallet → Agent ID) and use that wallet.',
  AgentIdContractHasNoCode: 'Misconfigured Agent ID contract address.',
  ProfileAlreadyExists: 'This wallet already has a SkillProof profile. Use "Update profile" instead.',
  NoProfile: 'Create your profile first.',
  ProfileNotFound: 'That profile does not exist.',
  InvalidAgentLabel: 'Invalid .ai name.',
  AgentLabelNotOwned: 'The Agent ID contract says this wallet does not own that .ai name.',
  AgentIdAlreadyBound: 'That Agent ID is already bound to another profile.',
  LabelAlreadyBound: 'Your profile already has a .ai name bound.',
  NotProfileOwner: 'Only the profile owner can do that.',
  ProjectNotFound: 'That project does not exist.',
  ProjectNotActive: 'That project was already superseded or revoked.',
  NotProjectCreator: 'Only the project creator can do that.',
  TooManyProjects: 'This profile reached the project limit (200).',
  SelfAttestation: 'You cannot attest to your own profile.',
  ProjectNotActiveForProfile: 'The project is not active or does not belong to this profile.',
  DuplicateActiveAttestation: 'You already have an active attestation for this project and skill.',
  AttestationNotFound: 'That attestation does not exist.',
  NotIssuer: 'Only the wallet that signed the attestation can revoke it.',
  AlreadyRevoked: 'Already revoked.',
  InvalidKey: 'Invalid skill / credential type key (use lowercase a-z, 0-9, - . + #, max 32 chars).',
  InvalidURI: 'Metadata URI is empty or longer than 256 characters.',
  InvalidHash: 'Metadata hash is missing.',
  InvalidIssuer: 'Invalid issuer address.',
  InvalidName: 'Issuer name must be 1–64 characters.',
  SelfIssuance: 'Issuers cannot issue credentials to their own profile.',
  InvalidExpiry: 'Expiry must be in the future (or empty for no expiry).',
  CredentialNotFound: 'That credential does not exist.',
  NotAuthorizedToRevoke: 'Only the issuer or protocol governance can revoke this credential.',
  UseSetIssuer: 'Issuer roles are managed with setIssuer.',
  AccessControlUnauthorizedAccount: 'This wallet is not authorized for that action (e.g. not an approved issuer).',
  EnforcedPause: 'This action is temporarily paused by the protocol admin.',
}

/** Extract a friendly message from a viem error (works for simulate and write errors). */
export function explainError(err: unknown): string {
  const e = err as { name?: string; shortMessage?: string; message?: string; walk?: (fn: (e: unknown) => boolean) => unknown }
  const inner = typeof e?.walk === 'function' ? (e.walk((x) => !!(x as { data?: { errorName?: string } })?.data?.errorName) as { data?: { errorName?: string } } | null) : null
  const name = inner?.data?.errorName
  if (name) return REVERT_MESSAGES[name] ?? `Reverted: ${name}`
  const msg = e?.shortMessage || e?.message || 'Unknown error'
  if (/user rejected|denied/i.test(msg)) return 'You rejected the request in your wallet.'
  if (/insufficient funds/i.test(msg)) return 'Not enough BNB to pay for gas.'
  for (const key of Object.keys(REVERT_MESSAGES)) if (msg.includes(key)) return REVERT_MESSAGES[key]!
  return msg
}
