import { forwardRef, type InputHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

/**
 * Shared field styling for Input / Textarea / Select. Kept here so the three
 * stay visually identical; `placeholder:text-faint` replaces the old
 * `placeholder:text-opacity-60`, which set an opacity with no colour to apply it
 * to and so did nothing.
 */
export const FIELD_BASE =
  'block w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink shadow-soft placeholder:text-faint transition-colors duration-(--motion-fast) focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50'

export const FIELD_VALID = 'border-line focus:border-brand-500 focus:ring-brand-500/40'
export const FIELD_INVALID = 'border-error focus:border-error focus:ring-error/30'

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        FIELD_BASE,
        invalid ? FIELD_INVALID : FIELD_VALID,
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
