import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { connectionsApi } from '@/api/connections'
import { qk } from '@/lib/queryClient'
import type {
  ConnectionCreate,
  ConnectionUpdate,
} from '@/types/api'

export function useConnections() {
  return useQuery({ queryKey: qk.connections, queryFn: connectionsApi.list })
}

export function useConnection(id: string | undefined) {
  return useQuery({
    queryKey: qk.connection(id ?? ''),
    queryFn: () => connectionsApi.get(id as string),
    enabled: !!id,
  })
}

export function useConnectionTables(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.connectionTables(id ?? ''),
    queryFn: () => connectionsApi.tables(id as string),
    enabled: !!id && enabled,
    staleTime: 60_000,
  })
}

export function useConnectionColumns(
  id: string | undefined,
  table: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['connections', id ?? '', 'columns', table ?? ''],
    queryFn: () => connectionsApi.columns(id as string, table as string),
    enabled: !!id && !!table && enabled,
    staleTime: 60_000,
  })
}

export function useCreateConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ConnectionCreate) => connectionsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.connections }),
  })
}

export function useUpdateConnection(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ConnectionUpdate) =>
      connectionsApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.connections })
      qc.invalidateQueries({ queryKey: qk.connection(id) })
    },
  })
}

export function useDeleteConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => connectionsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.connections }),
  })
}
