import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { usersApi } from '@/api/users'
import { qk } from '@/lib/queryClient'
import type { Role, UserStatus } from '@/types/api'

export function useUsers() {
  return useQuery({ queryKey: qk.users, queryFn: usersApi.list })
}

export function useSetUserRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      usersApi.setRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  })
}

export function useSetUserStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      usersApi.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  })
}
