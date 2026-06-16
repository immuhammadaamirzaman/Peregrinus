import { api } from '@/lib/api'
import type { RegisterRequest, Token, UserRead } from '@/types/api'

export const authApi = {
  /**
   * OAuth2 password flow — the backend expects form-encoded fields with
   * `username` carrying the email. Sent without a Bearer header.
   */
  async login(email: string, password: string): Promise<Token> {
    const form = new URLSearchParams()
    form.set('username', email)
    form.set('password', password)
    const { data } = await api.post<Token>('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return data
  },

  async register(payload: RegisterRequest): Promise<UserRead> {
    const { data } = await api.post<UserRead>('/auth/register', payload)
    return data
  },

  async me(): Promise<UserRead> {
    const { data } = await api.get<UserRead>('/auth/me')
    return data
  },
}
