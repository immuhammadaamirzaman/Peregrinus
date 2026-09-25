import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'animate-rise flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-surface-secondary px-6 py-14 text-center',
        className,
      )}
    >
      {/* bg-brand-50 / text-brand-600 now genuinely follows the theme: the brand
          ramp is inverted on dark themes, so this reads as a subtle dark violet
          disc rather than the bright white patch it used to be. */}
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
