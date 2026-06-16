import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeftRight, ArrowRight, Ban, Play, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { useConnections } from '@/hooks/useConnections'
import {
  useCancelMigration,
  useDeleteMigration,
  useMigrations,
  useStartMigration,
} from '@/hooks/useMigrations'
import { isActive, isStartable } from '@/constants/db'
import { getApiErrorMessage } from '@/lib/api'
import { formatRelative, progressPct } from '@/lib/format'
import { CanWrite } from '@/components/RoleGate'
import { MigrationStatusBadge } from '@/components/StatusBadge'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { PageLoader } from '@/components/ui/Spinner'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table'
import type { MigrationRead } from '@/types/api'

export function MigrationsPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch } = useMigrations()
  const connections = useConnections()
  const start = useStartMigration()
  const cancel = useCancelMigration()
  const del = useDeleteMigration()
  const [deleting, setDeleting] = useState<MigrationRead | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const connName = useMemo(() => {
    const map = new Map<string, string>()
    connections.data?.forEach((c) => map.set(c.id, c.name))
    return (id: string) => map.get(id) ?? 'Unknown'
  }, [connections.data])

  async function handleStart(m: MigrationRead) {
    setBusyId(m.id)
    try {
      await start.mutateAsync(m.id)
      toast.success(`Started "${m.name}".`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function handleCancel(m: MigrationRead) {
    setBusyId(m.id)
    try {
      await cancel.mutateAsync(m.id)
      toast.success(`Cancelled "${m.name}".`)
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
      toast.success('Migration deleted.')
      setDeleting(null)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title="Migrations"
        description="Full-dump copy jobs between your database connections."
        actions={
          <CanWrite>
            <Link to="/migrations/new">
              <Button>
                <Plus className="h-4 w-4" />
                New migration
              </Button>
            </Link>
          </CanWrite>
        }
      />

      {isLoading ? (
        <PageLoader label="Loading migrations…" />
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No migrations yet"
          description="Set up a migration to copy tables from one database to another."
          action={
            <CanWrite
              fallback={<p className="text-sm text-slate-500">You have read-only access.</p>}
            >
              <Link to="/migrations/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  New migration
                </Button>
              </Link>
            </CanWrite>
          }
        />
      ) : (
        <Card>
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Route</Th>
                <Th>Status</Th>
                <Th className="w-40">Progress</Th>
                <Th>Updated</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.map((m) => {
                const pct = progressPct(m.processed_rows, m.total_rows)
                const busy = busyId === m.id
                return (
                  <Tr
                    key={m.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/migrations/${m.id}`)}
                  >
                    <Td>
                      <span className="font-medium text-slate-900">{m.name}</span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="max-w-[110px] truncate">
                          {connName(m.source_connection_id)}
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0" />
                        <span className="max-w-[110px] truncate">
                          {connName(m.target_connection_id)}
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <MigrationStatusBadge status={m.status} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <ProgressBar
                          value={pct}
                          tone={
                            m.status === 'failed'
                              ? 'danger'
                              : m.status === 'completed'
                                ? 'success'
                                : 'info'
                          }
                          animated={m.status === 'running'}
                          className="w-24"
                        />
                        <span className="w-9 text-right text-xs text-slate-500">
                          {pct}%
                        </span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-slate-500">
                      {formatRelative(m.updated_at)}
                    </Td>
                    <Td onClick={(e) => e.stopPropagation()} className="text-right">
                      <CanWrite
                        fallback={
                          <Link
                            to={`/migrations/${m.id}`}
                            className="text-sm font-medium text-brand-600 hover:text-brand-700"
                          >
                            View
                          </Link>
                        }
                      >
                        <div className="flex items-center justify-end gap-1">
                          {isStartable(m.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={busy}
                              onClick={() => handleStart(m)}
                            >
                              <Play className="h-3.5 w-3.5" />
                              {m.status === 'draft' ? 'Start' : 'Restart'}
                            </Button>
                          )}
                          {isActive(m.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={busy}
                              onClick={() => handleCancel(m)}
                            >
                              <Ban className="h-3.5 w-3.5" />
                              Cancel
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => setDeleting(m)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CanWrite>
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete migration"
        message={
          <>
            Delete <strong>{deleting?.name}</strong> and its logs? This can&apos;t
            be undone.
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
