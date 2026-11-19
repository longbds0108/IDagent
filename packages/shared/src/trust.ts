/**
 * Three trust levels that attested never merges into a single "verified" badge.
 */
export const trustLevels = {
  self: {
    label: 'Self-reported',
    short: 'Self',
    proves: 'The profile owner published this record from their own Agent ID wallet.',
    doesNotProve: 'That the claim is accurate. Nobody else has vouched for it.',
  },
  peer: {
    label: 'Peer attested',
    short: 'Peer',
    proves: 'Another Agent ID holder signed an on-chain statement about this skill on this project.',
    doesNotProve: 'That the statement is true, or that the signer is independent or a unique person.',
  },
  issuer: {
    label: 'Approved issuer credential',
    short: 'Issuer',
    proves: 'An organization approved by the attested admin issued this credential and has not revoked it.',
    doesNotProve: 'Factual infallibility. Issuers review evidence outside the protocol.',
  },
} as const
export type TrustLevel = keyof typeof trustLevels

export const LIMITATIONS = [
  'Holding an Agent ID is an eligibility signal, not proof of personhood or uniqueness.',
  'A peer attestation proves who signed a statement, not that the statement is true.',
  'An issuer credential proves issuance by an approved organization, not factual infallibility.',
  'On-chain hashes prove integrity of the referenced metadata, not the truth of its content.',
] as const
