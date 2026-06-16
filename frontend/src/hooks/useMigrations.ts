import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { migrationsApi } from '@/api/migrations'
import { qk } from '@/lib/queryClient'
import type { MigrationCreate, MigrationUpdate } from '@/types/api'

export function useMigrations() {
  return useQuery({ queryKey: qk.migrations, queryFn: migrationsApi.list })
}

export function useMigration(id: string | undefined) {
  return useQuery({
    queryKey: qk.migration(id ?? ''),
    queryFn: () => migrationsApi.get(id as string),
    enabled: !!id,
    // Poll while the job is active so per-table progress stays live; the SSE
    // stream handles logs + overall progress, this fills in table statuses.
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'running' || status === 'pending' ? 2000 : false
    },
  })
}

export function useCreateMigration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: MigrationCreate) => migrationsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.migrations }),
  })
}

export function useUpdateMigration(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: MigrationUpdate) => migrationsApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.migrations })
      qc.invalidateQueries({ queryKey: qk.migration(id) })
    },
  })
}

export function useDeleteMigration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => migrationsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.migrations }),
  })
}

export function useStartMigration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => migrationsApi.start(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.migrations })
      qc.setQueryData(qk.migration(data.id), data)
    },
  })
}

export function useCancelMigration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => migrationsApi.cancel(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.migrations })
      qc.setQueryData(qk.migration(data.id), data)
    },
  })
}
