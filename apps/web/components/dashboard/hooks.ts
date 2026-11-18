'use client'

import { useQuery } from '@tanstack/react-query'
import type { AttestationView, CredentialView, IssuerView, ProfileView, ProjectView } from '@/lib/reads'
import { getJson } from '@/lib/client-api'
import { useIdentity } from '@/components/wallet/identity'

export interface ProfileBundle {
  profile: ProfileView
  projects: ProjectView[]
  attestations: AttestationView[]
  credentials: CredentialView[]
}

export function useProfileBundle(id: string | null | undefined) {
  return useQuery({
    queryKey: ['profile', id],
    enabled: !!id,
    queryFn: () => getJson<ProfileBundle>(`/api/profile/${id}`),
  })
}

export function useMyProfile() {
  const { account } = useIdentity()
  return useProfileBundle(account?.profileId)
}

export function useIssued() {
  const { address } = useIdentity()
  return useQuery({
    queryKey: ['issued', address],
    enabled: !!address,
    queryFn: () => getJson<{ attestations: AttestationView[]; credentials: CredentialView[] }>(`/api/issued/${address}`),
  })
}

export function useIssuers() {
  return useQuery({ queryKey: ['issuers'], queryFn: () => getJson<{ issuers: IssuerView[] }>('/api/issuers') })
}
