import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { authApi } from '@/api/auth'
import { AUTH_LOGOUT_EVENT } from '@/lib/api'
import { tokenStore } from '@/lib/tokens'
import type { RegisterRequest, Role, UserRead } from '@/types/api'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  user: UserRead | null
  status: AuthStatus
  isAuthenticated: boolean
  /** admin or user — anyone allowed to mutate resources (not guest). */
  canWrite: boolean
  isAdmin: boolean
  hasRole: (...roles: Role[]) => boolean
  login: (email: string, password: string) => Promise<UserRead>
  register: (payload: RegisterRequest) => Promise<UserRead>
  logout: () => void
  /** Re-fetch /auth/me (e.g. after a self-service change). */
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRead | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  const applyUser = useCallback((u: UserRead | null) => {
    setUser(u)
    setStatus(u ? 'authenticated' : 'unauthenticated')
  }, [])

  // Hydrate the session on first load: the access token lives only in memory,
  // so try a cookie-backed refresh to mint a new one, then fetch the profile.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await authApi.refresh()
        if (cancelled) return
        tokenStore.setAccess(token.access_token)
        const me = await authApi.me()
        if (!cancelled) applyUser(me)
      } catch {
        if (!cancelled) {
          tokenStore.clear()
          applyUser(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyUser])

  // React to a forced logout from the axios refresh interceptor.
  useEffect(() => {
    const onLogout = () => applyUser(null)
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout)
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout)
  }, [applyUser])

  const login = useCallback(
    async (email: string, password: string) => {
      const token = await authApi.login(email, password)
      tokenStore.setAccess(token.access_token)
      const me = await authApi.me()
      applyUser(me)
      return me
    },
    [applyUser],
  )

  const register = useCallback(
    (payload: RegisterRequest) => authApi.register(payload),
    [],
  )

  const logout = useCallback(() => {
    // Best-effort server-side revocation; clear local state regardless.
    void authApi.logout().catch(() => undefined)
    tokenStore.clear()
    applyUser(null)
  }, [applyUser])

  const refreshUser = useCallback(async () => {
    const me = await authApi.me()
    applyUser(me)
  }, [applyUser])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated' && user != null,
      canWrite: user?.role === 'admin' || user?.role === 'user',
      isAdmin: user?.role === 'admin',
      hasRole: (...roles: Role[]) => (user ? roles.includes(user.role) : false),
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, status, login, register, logout, refreshUser],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
