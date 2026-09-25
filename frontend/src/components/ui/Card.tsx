import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a hover lift + shadow. For cards that are links or open something. */
  interactive?: boolean
}

export function Card({ className, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line bg-surface',
        // `.dm-card-interactive` supplies its own resting shadow, so the utility
        // is only added for static cards. Using both would let the utility
        // (higher layer) override the hover shadow.
        interactive ? 'dm-card-interactive' : 'shadow-soft',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  description,
  action,
  className,
  style,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-line px-5 py-4',
        className,
      )}
      style={style}
    >
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4 text-ink', className)} {...props} />
}

/** Styled list row for cards that render a divided list. */
export function CardListItem({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('dm-row border-b border-line px-5 py-3.5', className)}
      {...props}
    />
  )
}
