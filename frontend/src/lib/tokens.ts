/**
 * Token persistence.
 *
 * Tokens live in localStorage so a refresh keeps the session. This is a
 * deliberate, documented trade-off: it is XSS-exposed, but the backend issues
 * short-lived access tokens (15 min) + rotatable refresh tokens (7 days), and
 * the SPA must attach the access token as a Bearer header on every request
 * (including the SSE stream, which a cookie-only flow could not authorize
 * through the native EventSource API). Keep the app free of untrusted HTML/JS
 * to hold up the XSS assumption.
 */
import type { Token } from '@/types/api'

const ACCESS_KEY = 'dm.access_token'
const REFRESH_KEY = 'dm.refresh_token'

export const tokenStore = {
  getAccess(): string | null {
    return localStorage.getItem(ACCESS_KEY)
  },
  getRefresh(): string | null {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(token: Token): void {
    localStorage.setItem(ACCESS_KEY, token.access_token)
    localStorage.setItem(REFRESH_KEY, token.refresh_token)
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}
