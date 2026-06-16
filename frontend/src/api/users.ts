import { api } from '@/lib/api'
import type { Role, UserRead, UserStatus } from '@/types/api'

export const usersApi = {
  async list(): Promise<UserRead[]> {
    const { data } = await api.get<UserRead[]>('/users')
    return data
  },

  async get(id: string): Promise<UserRead> {
    const { data } = await api.get<UserRead>(`/users/${id}`)
    return data
  },

  async setRole(id: string, role: Role): Promise<UserRead> {
    const { data } = await api.patch<UserRead>(`/users/${id}/role`, { role })
    return data
  },

  async setStatus(id: string, status: UserStatus): Promise<UserRead> {
    const { data } = await api.patch<UserRead>(`/users/${id}/status`, { status })
    return data
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/users/${id}`)
  },
}
