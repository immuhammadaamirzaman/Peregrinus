import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

type AlertTone = 'info' | 'success' | 'warning' | 'error'

/**
 * Inline callout panel.
 *
 * This markup was duplicated nine times across the pages, each copy hardcoding
 * `bg-red-50 text-red-700 ring-red-200` (or the amber/emerald equivalent) —
 * which is exactly the pattern that could never respond to a theme. Centralising
 * it means the semantic token triples are applied in one place.
 */
const TONES: Record<AlertTone, { className: string; icon: LucideIcon }> = {
  info: {
    className: 'bg-info-soft text-info-fg ring-info/25',
    icon: Info,
  },
  success: {
    className: 'bg-success-soft text-success-fg ring-success/25',
    icon: CheckCircle2,
  },
  warning: {
    className: 'bg-warning-soft text-warning-fg ring-warning/25',
    icon: TriangleAlert,
  },
  error: {
    className: 'bg-error-soft text-error-fg ring-error/25',
    icon: AlertCircle,
  },
}

export function Alert({
  tone = 'info',
  title,
  children,
  icon,
  className,
}: {
  tone?: AlertTone
  /** Emphasised first line. Omit for a single-line message. */
  title?: ReactNode
  children?: ReactNode
  /** Override the default tone icon. Pass `null` to drop it entirely. */
  icon?: LucideIcon | null
  className?: string
}) {
  const { className: toneClass, icon: ToneIcon } = TONES[tone]
  const Icon = icon === null ? null : (icon ?? ToneIcon)

  return (
    <div
      className={cn(
        'animate-fade flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset',
        toneClass,
        className,
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children}
      </div>
    </div>
  )
}
