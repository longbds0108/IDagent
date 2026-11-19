import Link from 'next/link'
import { buttonClass } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="py-24">
      <p className="sp-label">404 · NO SUCH PROFILE</p>
      <h1 className="sp-display mt-5 text-[clamp(3rem,8vw,6.5rem)]">Profile not found</h1>
      <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-2">
        Profiles resolve by id, by a .ai name the owner bound on attested, or by owner address.
      </p>
      <Link href="/builders" className={buttonClass('secondary', 'md', 'mt-8')}>
        Explore builders
      </Link>
    </div>
  )
}
