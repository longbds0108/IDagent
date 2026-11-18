'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Toast = { id: number; tone: 'ok' | 'bad' | 'info'; text: string; href?: string; linkLabel?: string }
const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})

/**
 * App-level notifications. Success messages must outlive the button that triggered them: after a
 * revoke or an accept/decline, the triggering control is removed from the page.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setItems((xs) => [...xs.slice(-3), { ...t, id }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 7000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'sp-enter pointer-events-auto border-l-2 bg-[#17141b] px-4 py-3 text-[13px] shadow-[0_12px_40px_rgba(0,0,0,0.45)]',
              t.tone === 'ok' ? 'border-l-ok text-ok' : t.tone === 'bad' ? 'border-l-bad text-bad' : 'border-l-accent text-ink',
            )}
          >
            <span className="text-ink">{t.text}</span>
            {t.href ? (
              <a className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.04em] underline underline-offset-4" href={t.href} target="_blank" rel="noreferrer">
                {t.linkLabel ?? 'View'} ↗
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
