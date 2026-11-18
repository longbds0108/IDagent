import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-[var(--accent-hover)] hover:text-white border border-accent',
  accent: 'bg-accent text-accent-ink hover:bg-[var(--accent-hover)] hover:text-white border border-accent',
  secondary: 'bg-transparent text-ink border border-line-strong hover:border-accent hover:text-peer',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2 border border-transparent',
  danger: 'bg-transparent text-bad border border-bad/40 hover:bg-bad-bg hover:border-bad',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[10.5px] gap-1.5',
  md: 'h-11 px-4 text-[11.5px] gap-2',
  lg: 'h-[54px] px-5 text-[12px] gap-2',
}

/** Square mono uppercase buttons, as in the reference's `.shiny-action`. */
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex items-center justify-center font-mono font-medium uppercase tracking-[0.04em] transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap',
    variants[variant],
    sizes[size],
    className,
  )
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: boolean | ReactNode }
>(function Button({ variant, size, className, icon, children, ...props }, ref) {
  if (icon && (variant ?? 'primary') !== 'ghost') {
    // Split action: label cell + icon cell separated by a gap in the page colour.
    return (
      <button
        ref={ref}
        className={cn(buttonClass(variant, size, className), 'grid grid-cols-[1fr_auto] items-stretch !gap-0 !px-0')}
        {...props}
      >
        <span className="flex items-center px-4">{children}</span>
        <span className="grid aspect-square place-items-center border-l-[6px] border-bg text-[15px] font-sans normal-case" aria-hidden>
          {icon === true ? '↗' : icon}
        </span>
      </button>
    )
  }
  return (
    <button ref={ref} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </button>
  )
})
