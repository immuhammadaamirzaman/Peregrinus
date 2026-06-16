import { api } from '@/lib/api'
import type {
  ConnectionCreate,
  ConnectionRead,
  ConnectionTestRequest,
  ConnectionTestResult,
  ConnectionUpdate,
  TableColumns,
  TableList,
} from '@/types/api'

export const connectionsApi = {
  async list(): Promise<ConnectionRead[]> {
    const { data } = await api.get<ConnectionRead[]>('/connections')
    return data
  },

  async get(id: string): Promise<ConnectionRead> {
    const { data } = await api.get<ConnectionRead>(`/connections/${id}`)
    return data
  },

  async create(payload: ConnectionCreate): Promise<ConnectionRead> {
    const { data } = await api.post<ConnectionRead>('/connections', payload)
    return data
  },

  async update(id: string, payload: ConnectionUpdate): Promise<ConnectionRead> {
    const { data } = await api.patch<ConnectionRead>(
      `/connections/${id}`,
      payload,
    )
    return data
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/connections/${id}`)
  },

  /** Test an unsaved config (the "Test connection" button on the form). */
  async testConfig(payload: ConnectionTestRequest): Promise<ConnectionTestResult> {
    const { data } = await api.post<ConnectionTestResult>(
      '/connections/test',
      payload,
    )
    return data
  },

  /** Test a saved connection by id. */
  async testExisting(id: string): Promise<ConnectionTestResult> {
    const { data } = await api.post<ConnectionTestResult>(
      `/connections/${id}/test`,
    )
    return data
  },

  async tables(id: string): Promise<TableList> {
    const { data } = await api.get<TableList>(`/connections/${id}/tables`)
    return data
  },

  async columns(id: string, table: string): Promise<TableColumns> {
    const { data } = await api.get<TableColumns>(`/connections/${id}/columns`, {
      params: { table },
    })
    return data
  },
}
