import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

import { MOTION_KEEP } from '@/constants/motion'
import { cn } from '@/lib/cn'

type Variant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'outline'
  /** Ghost button that reads as destructive — row-level delete actions. */
  | 'ghostDanger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

/**
 * Each variant is a single `.dm-btn-*` class defined in index.css, which owns
 * both the resting colours and the hover/active treatment (derived from theme
 * tokens with `color-mix`, and lifting by the active motion tier's amount).
 *
 * Resting colours are deliberately *not* `bg-*` utilities here. Tailwind's
 * utilities layer outranks the components layer, so a `bg-brand-600` class
 * would beat `.dm-btn-primary:hover` and the hover state would never paint.
 * Keeping both in one layer fixes the ordering while still letting a caller
 * override via `className` — a utility passed in wins over either.
 *
 * This also replaces the old inline `style` objects (which a caller's className
 * could never override) and the `filter: brightness()` hover, which promoted
 * every button to its own compositor layer on pointer-over.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'dm-btn-primary',
  secondary: 'dm-btn-secondary',
  outline: 'dm-btn-outline',
  ghost: 'dm-btn-ghost',
  danger: 'dm-btn-danger',
  ghostDanger: 'dm-btn-ghost-danger',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
  icon: 'h-9 w-9',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading,
      disabled,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'dm-btn inline-flex items-center justify-center rounded-lg font-medium',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {/* Exempt from the motion kill switch: a spinner that doesn't spin reads
          as a frozen UI rather than a considerate one. */}
      {loading && <Loader2 className={cn('h-4 w-4 animate-spin', MOTION_KEEP)} />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
