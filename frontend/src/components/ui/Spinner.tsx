import { Loader2 } from 'lucide-react'

import { MOTION_KEEP } from '@/constants/motion'
import { cn } from '@/lib/cn'

/**
 * Carries `dm-motion-keep` so it keeps spinning even when animations are turned
 * off or the OS asks for reduced motion. A frozen spinner looks like a hung app;
 * this is the one case where suppressing motion is worse than allowing it.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn('h-5 w-5 animate-spin text-brand-500', MOTION_KEEP, className)}
      aria-hidden
    />
  )
}

/** Full-area centered spinner for route/page loading states. */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted"
      role="status"
      aria-live="polite"
    >
      <Spinner className="h-7 w-7" />
      {label && <p className="animate-fade text-sm">{label}</p>}
    </div>
  )
}

/**
 * Placeholder block for content that is still loading. Prefer this over a
 * spinner where the final layout is known — it avoids the content jump that a
 * centred spinner causes when it's replaced.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('dm-skeleton h-4 w-full', className)} aria-hidden />
}
