import { errorResponse, json } from '@/lib/http'
import { getAttestationsReceived, getCredentialsOf, getProfile, getProjectsOf, resolveProfileId } from '@/lib/reads'

export const dynamic = 'force-dynamic'

/** Full, uncached profile bundle read straight from chain (used by the dashboard). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const pid = await resolveProfileId(id)
    if (pid === null) return json({ error: 'Profile not found' }, { status: 404 })
    const [profile, projects, attestations, credentials] = await Promise.all([
      getProfile(pid),
      getProjectsOf(pid),
      getAttestationsReceived(pid),
      getCredentialsOf(pid),
    ])
    if (!profile) return json({ error: 'Profile not found' }, { status: 404 })
    return json({ profile, projects, attestations, credentials })
  } catch (e) {
    return errorResponse(e)
  }
}
