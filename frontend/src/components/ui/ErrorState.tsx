import { AlertTriangle } from 'lucide-react'

import { getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/Button'

export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
}: {
  error: unknown
  onRetry?: () => void
  title?: string
}) {
  return (
    <div
      className="animate-rise flex flex-col items-center justify-center rounded-xl border border-error/30 bg-error-soft px-6 py-12 text-center"
      role="alert"
    >
      <AlertTriangle className="mb-3 h-8 w-8 text-error" />
      <h3 className="text-sm font-semibold text-error-fg">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-error-fg/80">
        {getApiErrorMessage(error)}
      </p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
