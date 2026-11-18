import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter_Tight, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import './shiny.css'
import { Providers } from './providers'

const display = Fraunces({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--sp-font-display' })
const body = Inter_Tight({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--sp-font-body' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--sp-font-mono' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_APP_URL || 'http://localhost:3000'),
  title: { default: 'SkillProof: evidence-backed builder profiles', template: '%s · SkillProof' },
  description:
    'Builder portfolios anchored to Agent ID on BNB Smart Chain. Self-reported projects, peer attestations and approved-issuer credentials, each kept separate and checkable on-chain.',
  openGraph: { type: 'website', siteName: 'SkillProof' },
}

export const viewport: Viewport = {
  themeColor: '#111015',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-sans text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
