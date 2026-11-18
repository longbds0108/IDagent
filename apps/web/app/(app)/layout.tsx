import { SiteFooter, SiteHeader } from '@/components/site'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sp-app">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1320px] px-4 sm:px-8">{children}</main>
      <SiteFooter />
    </div>
  )
}
