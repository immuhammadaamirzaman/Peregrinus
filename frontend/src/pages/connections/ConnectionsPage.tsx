import { useState } from 'react'
import {
  Database,
  Pencil,
  Plug,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { connectionsApi } from '@/api/connections'
import { useConnections, useDeleteConnection } from '@/hooks/useConnections'
import { DB_TYPE_LABELS } from '@/constants/db'
import { getApiErrorMessage } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { CanWrite } from '@/components/RoleGate'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { PageLoader } from '@/components/ui/Spinner'
import { ConnectionFormModal } from '@/pages/connections/ConnectionFormModal'
import type { ConnectionRead } from '@/types/api'

export function ConnectionsPage() {
  const { data, isLoading, isError, error, refetch } = useConnections()
  const del = useDeleteConnection()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ConnectionRead | null>(null)
  const [deleting, setDeleting] = useState<ConnectionRead | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(conn: ConnectionRead) {
    setEditing(conn)
    setFormOpen(true)
  }

  async function testExisting(conn: ConnectionRead) {
    setTestingId(conn.id)
    try {
      const result = await connectionsApi.testExisting(conn.id)
      if (result.ok) {
        toast.success(`${conn.name}: ${result.message}`, {
          description:
            [
              result.server_version && `Server ${result.server_version}`,
              result.latency_ms != null && `${result.latency_ms.toFixed(0)} ms`,
            ]
              .filter(Boolean)
              .join(' · ') || undefined,
        })
      } else {
        toast.error(`${conn.name}: ${result.message}`)
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setTestingId(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await del.mutateAsync(deleting.id)
      toast.success('Connection deleted.')
      setDeleting(null)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  function target(conn: ConnectionRead): string {
    if (conn.db_type === 'sqlite') return conn.database_name
    const hostPart = conn.host ?? '—'
    const portPart = conn.port ? `:${conn.port}` : ''
    return `${hostPart}${portPart}/${conn.database_name}`
  }

  return (
    <>
      <PageHeader
        title="Connections"
        description="Database connections you can use as migration sources and targets."
        actions={
          <CanWrite>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New connection
            </Button>
          </CanWrite>
        }
      />

      {isLoading ? (
        <PageLoader label="Loading connections…" />
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No connections yet"
          description="Add your first database connection. Credentials are encrypted at rest."
          action={
            <CanWrite
              fallback={
                <p className="text-sm text-slate-500">
                  You have read-only access.
                </p>
              }
            >
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                New connection
              </Button>
            </CanWrite>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((conn) => (
            <Card key={conn.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Database className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {conn.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {DB_TYPE_LABELS[conn.db_type]}
                    </p>
                  </div>
                </div>
                {conn.has_password && (
                  <ShieldCheck className="h-4 w-4 text-emerald-500" aria-label="Credential stored" />
                )}
              </div>

              <p className="mt-4 truncate font-mono text-xs text-slate-500" title={target(conn)}>
                {target(conn)}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={conn.ssl_mode === 'disable' ? 'neutral' : 'success'}>
                  SSL: {conn.ssl_mode}
                </Badge>
                <span className="text-xs text-slate-400">
                  Added {formatRelative(conn.created_at)}
                </span>
              </div>

              <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testExisting(conn)}
                  loading={testingId === conn.id}
                >
                  <Plug className="h-3.5 w-3.5" />
                  Test
                </Button>
                <CanWrite>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(conn)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-red-600 hover:bg-red-50"
                    onClick={() => setDeleting(conn)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CanWrite>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConnectionFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        connection={editing}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Delete connection"
        message={
          <>
            Delete <strong>{deleting?.name}</strong>? This can&apos;t be undone.
            Connections used by a migration can&apos;t be deleted.
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
