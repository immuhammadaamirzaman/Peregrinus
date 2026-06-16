import { useState } from 'react'
import { Check, ShieldX, Trash2, UserCog, Ban, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/auth/AuthContext'
import {
  useDeleteUser,
  useSetUserRole,
  useSetUserStatus,
  useUsers,
} from '@/hooks/useUsers'
import { getApiErrorMessage } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { UserStatusBadge } from '@/components/StatusBadge'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorState } from '@/components/ui/ErrorState'
import { PageLoader } from '@/components/ui/Spinner'
import { Select } from '@/components/ui/Select'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table'
import type { Role, UserRead, UserStatus } from '@/types/api'

export function UsersPage() {
  const { user: me } = useAuth()
  const { data, isLoading, isError, error, refetch } = useUsers()
  const setRole = useSetUserRole()
  const setStatus = useSetUserStatus()
  const del = useDeleteUser()
  const [deleting, setDeleting] = useState<UserRead | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function changeStatus(u: UserRead, status: UserStatus) {
    setBusyId(u.id)
    try {
      await setStatus.mutateAsync({ id: u.id, status })
      toast.success(`${u.email} → ${status}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function changeRole(u: UserRead, role: Role) {
    setBusyId(u.id)
    try {
      await setRole.mutateAsync({ id: u.id, role })
      toast.success(`${u.email} is now ${role}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await del.mutateAsync(deleting.id)
      toast.success('User deleted.')
      setDeleting(null)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Approve sign-ups and manage roles. New accounts start as pending."
      />

      {isLoading ? (
        <PageLoader label="Loading users…" />
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <Card>
          <Table>
            <Thead>
              <Tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Last login</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data?.map((u) => {
                const isSelf = u.id === me?.id
                const busy = busyId === u.id
                return (
                  <Tr key={u.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                          {(u.full_name || u.email)[0]?.toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">
                            {u.full_name || '—'}
                            {isSelf && (
                              <span className="ml-1.5 text-xs font-normal text-slate-400">
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Select
                        value={u.role}
                        disabled={isSelf || busy}
                        onChange={(e) => changeRole(u, e.target.value as Role)}
                        className="h-9 w-28 text-xs"
                      >
                        <option value="admin">Admin</option>
                        <option value="user">User</option>
                        <option value="guest">Guest</option>
                      </Select>
                    </Td>
                    <Td>
                      <UserStatusBadge status={u.status} />
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-slate-500">
                      {u.last_login_at ? formatRelative(u.last_login_at) : 'Never'}
                    </Td>
                    <Td className="text-right">
                      {isSelf ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {u.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={busy}
                                className="text-emerald-600 hover:bg-emerald-50"
                                onClick={() => changeStatus(u, 'approved')}
                              >
                                <Check className="h-3.5 w-3.5" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:bg-red-50"
                                onClick={() => changeStatus(u, 'rejected')}
                              >
                                <ShieldX className="h-3.5 w-3.5" />
                                Reject
                              </Button>
                            </>
                          )}
                          {u.status === 'approved' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={busy}
                              onClick={() => changeStatus(u, 'disabled')}
                            >
                              <Ban className="h-3.5 w-3.5" />
                              Disable
                            </Button>
                          )}
                          {(u.status === 'disabled' || u.status === 'rejected') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={busy}
                              className="text-emerald-600 hover:bg-emerald-50"
                              onClick={() => changeStatus(u, 'approved')}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Reinstate
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => setDeleting(u)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </Td>
                  </Tr>
                )
              })}
              {data && data.length === 0 && (
                <Tr>
                  <Td className="py-8 text-center text-slate-500">
                    <UserCog className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                    No users found.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete user"
        message={
          <>
            Delete <strong>{deleting?.email}</strong>? This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
