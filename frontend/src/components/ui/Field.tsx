import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

interface FieldProps {
  label?: ReactNode
  htmlFor?: string
  error?: string
  hint?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}

/** Label + control + hint/error wrapper for consistent form rows. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
          {label}
          {required && (
            <span className="ml-0.5 text-error" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="animate-fade text-xs text-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  )
}
