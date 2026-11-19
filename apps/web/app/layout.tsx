import type { Metadata, Viewport } from 'next'
import { Inter_Tight } from 'next/font/google'
import './globals.css'
import './shiny.css'
import { Providers } from './providers'

// One typeface for the whole dApp.
const font = Inter_Tight({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--sp-font-body' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_APP_URL || 'http://localhost:3000'),
  title: { default: 'attested: evidence-backed builder profiles', template: '%s · attested' },
  description:
    'Builder portfolios anchored to Agent ID on BNB Smart Chain. Self-reported projects, peer attestations and approved-issuer credentials, each kept separate and checkable on-chain.',
  openGraph: { type: 'website', siteName: 'attested' },
}

export const viewport: Viewport = {
  themeColor: '#111015',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable}>
      <body className="font-sans text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
