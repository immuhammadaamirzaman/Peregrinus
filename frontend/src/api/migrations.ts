import { api } from '@/lib/api'
import type {
  MigrationCreate,
  MigrationDetail,
  MigrationLogRead,
  MigrationRead,
  MigrationUpdate,
} from '@/types/api'

export const migrationsApi = {
  async list(): Promise<MigrationRead[]> {
    const { data } = await api.get<MigrationRead[]>('/migrations')
    return data
  },

  async get(id: string): Promise<MigrationDetail> {
    const { data } = await api.get<MigrationDetail>(`/migrations/${id}`)
    return data
  },

  async create(payload: MigrationCreate): Promise<MigrationDetail> {
    const { data } = await api.post<MigrationDetail>('/migrations', payload)
    return data
  },

  async update(id: string, payload: MigrationUpdate): Promise<MigrationDetail> {
    const { data } = await api.patch<MigrationDetail>(
      `/migrations/${id}`,
      payload,
    )
    return data
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/migrations/${id}`)
  },

  async start(id: string): Promise<MigrationDetail> {
    const { data } = await api.post<MigrationDetail>(`/migrations/${id}/start`)
    return data
  },

  async cancel(id: string): Promise<MigrationDetail> {
    const { data } = await api.post<MigrationDetail>(`/migrations/${id}/cancel`)
    return data
  },

  async logs(
    id: string,
    afterId = 0,
    limit = 200,
  ): Promise<MigrationLogRead[]> {
    const { data } = await api.get<MigrationLogRead[]>(
      `/migrations/${id}/logs`,
      { params: { after_id: afterId, limit } },
    )
    return data
  },
}
