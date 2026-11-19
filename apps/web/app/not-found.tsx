import Link from 'next/link'
import { buttonClass } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="sp-app grid min-h-dvh place-items-center px-4">
      <div>
        <p className="sp-label">404</p>
        <h1 className="sp-display mt-5 text-[clamp(3rem,9vw,7rem)]">Page not found</h1>
        <Link href="/" className={buttonClass('secondary', 'md', 'mt-8')}>
          Back home
        </Link>
      </div>
    </div>
  )
}
