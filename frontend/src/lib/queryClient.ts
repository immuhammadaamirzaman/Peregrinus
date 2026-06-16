import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Auth/permission errors won't fix themselves on retry.
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response
          ?.status
        if (status && [400, 401, 403, 404, 409, 422].includes(status))
          return false
        return failureCount < 2
      },
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
})

/** Centralised query keys so invalidation stays consistent. */
export const qk = {
  connections: ['connections'] as const,
  connection: (id: string) => ['connections', id] as const,
  connectionTables: (id: string) => ['connections', id, 'tables'] as const,
  migrations: ['migrations'] as const,
  migration: (id: string) => ['migrations', id] as const,
  users: ['users'] as const,
}
