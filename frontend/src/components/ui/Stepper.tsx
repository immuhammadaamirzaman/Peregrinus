import { Check } from 'lucide-react'

import { cn } from '@/lib/cn'

export function Stepper({
  steps,
  current,
}: {
  steps: string[]
  current: number
}) {
  return (
    <ol className="flex items-center">
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-inset',
                  // `duration-(--motion-base)` ties the transition to the active
                  // motion tier, so "off" makes step changes instant.
                  'transition-colors duration-(--motion-base)',
                  done && 'bg-brand-600 text-brand-fg ring-brand-600',
                  active && 'bg-brand-50 text-brand-700 ring-brand-300',
                  !done && !active && 'bg-surface text-faint ring-line',
                )}
                aria-current={active ? 'step' : undefined}
              >
                {done ? (
                  <Check className="animate-pop h-4 w-4" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  'hidden text-sm font-medium transition-colors duration-(--motion-base) sm:block',
                  active ? 'text-ink' : 'text-muted',
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  'mx-3 h-px flex-1 transition-colors duration-(--motion-base)',
                  done ? 'bg-brand-300' : 'bg-line',
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
