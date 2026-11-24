import { agentLoginInstructions } from '@/lib/login'

const TEXT = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }

/** The steps an AI agent follows to sign in. Public text: it holds only the hash of the browser's secret. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const h = url.searchParams.get('h') ?? ''
  if (!/^[0-9a-f]{64}$/.test(h)) {
    return new Response('Open the sign-in page again and copy a new prompt.', { status: 400, headers: TEXT })
  }
  return new Response(agentLoginInstructions(url.origin, h), { headers: TEXT })
}
