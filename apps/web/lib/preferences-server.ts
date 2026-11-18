import 'server-only'
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem'
import { skillAttestationAbi, skillProfileRegistryAbi } from '@skillproof/shared'
import { z } from 'zod'
import { DEFAULT_PREFERENCES, PREFERENCE_TYPES, preferenceDomain, preferenceMessage, type Preferences, type SignedPreferences } from './preferences'
import { preferenceStore } from './preferences-store'
import { client, contracts } from './reads'

export async function getPreferences(account: Address): Promise<Preferences & { signed: boolean }> {
  const stored = await preferenceStore().get(account).catch(() => null)
  return stored ? { ...stored, signed: true } : { ...DEFAULT_PREFERENCES(account), signed: false }
}

/** Map of account(lowercase) → preferences, for list views. */
export async function allPreferences(): Promise<Map<string, Preferences>> {
  const all = await preferenceStore().all().catch(() => [])
  return new Map(all.map((p) => [p.account.toLowerCase(), p]))
}

const idList = z.array(z.string().regex(/^\d{1,12}$/)).max(200)
export const signedPreferencesSchema = z.object({
  account: z.string().refine(isAddress),
  reputationOptIn: z.boolean(),
  hideFromExplore: z.boolean(),
  hideSocialLinks: z.boolean(),
  hideAvatar: z.boolean(),
  acceptedAttestations: idList,
  declinedAttestations: idList,
  issuedAt: z.number().int().positive(),
  signature: z.string().refine((s) => isHex(s) && s.length >= 132, 'signature expected'),
})

export class PreferenceError extends Error {}

export async function savePreferences(input: unknown): Promise<SignedPreferences> {
  const parsed = signedPreferencesSchema.safeParse(input)
  if (!parsed.success) throw new PreferenceError('Malformed preferences')
  const p = { ...parsed.data, account: getAddress(parsed.data.account), signature: parsed.data.signature as Hex } as SignedPreferences
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - p.issuedAt) > 15 * 60) throw new PreferenceError('Signature is too old or from the future. Sign again.')
  const existing = await preferenceStore().get(p.account)
  if (existing && existing.issuedAt >= p.issuedAt) throw new PreferenceError('A newer version of these preferences is already stored.')
  const overlap = p.acceptedAttestations.filter((x) => p.declinedAttestations.includes(x))
  if (overlap.length) throw new PreferenceError('An attestation cannot be both accepted and declined.')

  const c = contracts()
  const ok = await client().verifyTypedData({
    address: p.account,
    domain: preferenceDomain(c.profileRegistry),
    types: PREFERENCE_TYPES,
    primaryType: 'Preferences',
    message: preferenceMessage(p),
    signature: p.signature,
  })
  if (!ok) throw new PreferenceError('Signature does not match this account.')

  // Responses are only meaningful for attestations made to the signer's own profile.
  const ids = [...p.acceptedAttestations, ...p.declinedAttestations]
  if (ids.length) {
    const profileId = await client().readContract({ address: c.profileRegistry, abi: skillProfileRegistryAbi, functionName: 'profileOf', args: [p.account] })
    const subjects = await Promise.all(
      ids.map((id) =>
        client()
          .readContract({ address: c.attestationRegistry, abi: skillAttestationAbi, functionName: 'getAttestation', args: [BigInt(id)] })
          .then((a) => (a as { subjectProfileId: bigint }).subjectProfileId)
          .catch(() => -1n),
      ),
    )
    if (profileId === 0n || subjects.some((s) => s !== profileId)) {
      throw new PreferenceError('You can only respond to attestations made to your own profile.')
    }
  }
  await preferenceStore().put(p)
  return p
}
