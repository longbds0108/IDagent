import type { Viewport } from 'next'

export const viewport: Viewport = { themeColor: '#111015' }

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <div className="sp-landing">{children}</div>
}
