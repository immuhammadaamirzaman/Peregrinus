import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import { PageLoader } from '@/components/ui/Spinner'
import type { Role } from '@/types/api'

/**
 * Gate for authenticated routes. While the session hydrates we show a loader
 * (so we never flash the login page for an already-signed-in user). Optionally
 * restricts to a set of roles; an authenticated-but-unauthorized user is sent
 * to the dashboard rather than the login screen.
 */
export function ProtectedRoute({
  roles,
  children,
}: {
  roles?: Role[]
  children?: ReactNode
}) {
  const { status, isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <PageLoader label="Loading your session…" />

  if (!isAuthenticated)
    return <Navigate to="/login" replace state={{ from: location }} />

  if (roles && user && !roles.includes(user.role))
    return <Navigate to="/" replace />

  return children ? <>{children}</> : <Outlet />
}
