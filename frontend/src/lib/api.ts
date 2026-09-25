/**
 * Axios instance for the DataMovers API.
 *
 * Responsibilities:
 *  - prefix every call with `/api/v1` (proxied to the backend in dev),
 *  - attach the access token as a Bearer header,
 *  - transparently refresh the token pair once on a 401 and replay the request,
 *  - broadcast an `auth:logout` event when the session is irrecoverable so the
 *    React layer can redirect to /login.
 */
import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'

import type { ApiErrorBody, Token } from '@/types/api'
import { tokenStore } from '@/lib/tokens'

export const AUTH_LOGOUT_EVENT = 'auth:logout'

/** Fired when refresh fails — the AuthProvider listens and clears state. */
export function emitLogout(): void {
  window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT))
}

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  // Send the httpOnly refresh-token cookie on auth requests (refresh/logout).
  withCredentials: true,
})

// ── Request: attach Bearer token ────────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccess()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response: refresh-once on 401 ───────────────────────────────────
type RetriableConfig = AxiosRequestConfig & { _retry?: boolean }

// A single shared refresh promise prevents a stampede when many requests
// 401 at the same moment.
let refreshing: Promise<string | null> | null = null

async function runRefresh(): Promise<string | null> {
  try {
    // Bare axios (not `api`) so we skip the interceptors and avoid recursion.
    // No body: the refresh token rides along in the httpOnly cookie, which
    // requires withCredentials.
    const { data } = await axios.post<Token>(
      '/api/v1/auth/refresh',
      null,
      { withCredentials: true },
    )
    tokenStore.setAccess(data.access_token)
    return data.access_token
  } catch {
    return null
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined
    const status = error.response?.status
    const url = original?.url ?? ''

    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/refresh') ||
      url.includes('/auth/logout')

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true
      refreshing = refreshing ?? runRefresh()
      const newToken = await refreshing.finally(() => {
        refreshing = null
      })

      if (newToken) {
        original.headers = {
          ...original.headers,
          Authorization: `Bearer ${newToken}`,
        }
        return api(original)
      }

      // Refresh failed — session is dead.
      tokenStore.clear()
      emitLogout()
    }

    return Promise.reject(error)
  },
)

/** Pull a human-readable message out of any API/Axios error shape. */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined
    if (body?.error?.detail) return body.error.detail
    if (typeof body?.detail === 'string') return body.detail
    if (Array.isArray(body?.detail) && body.detail.length > 0) {
      // FastAPI 422 validation list → "field: message".
      const first = body.detail[0]
      const field = first.loc?.filter((p) => p !== 'body').join('.')
      return field ? `${field}: ${first.msg}` : first.msg
    }
    if (error.code === 'ERR_NETWORK')
      return 'Cannot reach the API. Is the backend running?'
    if (error.message) return error.message
  }
  if (error instanceof Error) return error.message
  return fallback
}
