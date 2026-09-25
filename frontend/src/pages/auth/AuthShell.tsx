import type { ReactNode } from 'react'
import { ArrowLeftRight } from 'lucide-react'

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    // The gradient is built from theme tokens instead of the old
    // `from-slate-50 via-canvas to-brand-50`, whose slate-50 stop kept the login
    // screen washed out and light on every dark theme.
    <div className="flex min-h-screen items-center justify-center bg-canvas bg-gradient-to-br from-surface via-canvas to-brand-50 px-4 py-12">
      <div className="animate-rise w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-brand-fg shadow-soft">
            <ArrowLeftRight className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        </div>

        <div className="rounded-2xl border border-line bg-surface p-7 shadow-raised">
          {children}
        </div>

        {footer && (
          <div className="mt-6 text-center text-sm text-muted">{footer}</div>
        )}
      </div>
    </div>
  )
}
