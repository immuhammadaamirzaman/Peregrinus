/**
 * Access-token store — **in-memory only**.
 *
 * The short-lived access token is kept in a module variable (never in
 * localStorage), so a successful XSS cannot exfiltrate a persisted credential.
 * The long-lived refresh token lives only in an httpOnly cookie the browser
 * sends automatically to the auth endpoints; JavaScript can neither read nor
 * write it. On a full page reload the in-memory token is lost and the session
 * is transparently restored via a cookie-backed `/auth/refresh` call.
 */

let accessToken: string | null = null

export const tokenStore = {
  getAccess(): string | null {
    return accessToken
  },
  setAccess(token: string | null): void {
    accessToken = token
  },
  clear(): void {
    accessToken = null
  },
}
