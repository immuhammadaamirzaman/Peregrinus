import type { ReactNode } from 'react'

import { useAuth } from '@/auth/AuthContext'
import type { Role } from '@/types/api'

/**
 * Conditionally render children based on the current user's role. Used to hide
 * mutating controls from guests (the backend enforces this too — this is just
 * UX so we don't show buttons that would 403).
 */
export function RoleGate({
  roles,
  children,
  fallback = null,
}: {
  roles: Role[]
  children: ReactNode
  fallback?: ReactNode
}) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) return <>{fallback}</>
  return <>{children}</>
}

/** Shorthand: render only for users who can mutate (admin/user, not guest). */
export function CanWrite({
  children,
  fallback = null,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  return (
    <RoleGate roles={['admin', 'user']} fallback={fallback}>
      {children}
    </RoleGate>
  )
}
