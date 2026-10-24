import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/Button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Top-level error boundary. A render error anywhere in the tree would otherwise
 * unmount the whole app and leave a blank page; this catches it and offers a
 * way back. A full reload is the safest recovery — it rebuilds all component
 * state from scratch, and the session is restored from the refresh cookie on
 * boot, so the user lands back where they were without re-authenticating.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface it for diagnosis; a real deployment would forward this to an
    // error-tracking service here.
    console.error('Unhandled render error:', error, info.componentStack)
  }

  private readonly handleReload = (): void => {
    window.location.assign('/')
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <AlertTriangle className="h-10 w-10 text-error" />
        <div>
          <h1 className="text-lg font-semibold text-ink">Something broke</h1>
          <p className="mt-1 max-w-md text-sm text-muted">
            The app hit an unexpected error and couldn&apos;t continue. Reloading
            usually clears it.
          </p>
        </div>
        <Button onClick={this.handleReload}>Reload DataMovers</Button>
      </div>
    )
  }
}
