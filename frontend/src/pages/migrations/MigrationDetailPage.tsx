import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Ban,
  Database,
  Play,
  Radio,
  Terminal,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { useConnections, useConnectionTables } from '@/hooks/useConnections'
import {
  useCancelMigration,
  useDeleteMigration,
  useMigration,
  useStartMigration,
  useUpdateMigration,
} from '@/hooks/useMigrations'
import { useMigrationStream } from '@/hooks/useMigrationStream'
import { useAuth } from '@/auth/AuthContext'
import { isActive, isStartable } from '@/constants/db'
import { getApiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  progressPct,
} from '@/lib/format'
import { CanWrite } from '@/components/RoleGate'
import { MigrationStatusBadge, TableStatusBadge } from '@/components/StatusBadge'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorState } from '@/components/ui/ErrorState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { PageLoader } from '@/components/ui/Spinner'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table'
import type { LogLevel, MigrationDetail } from '@/types/api'

const LOG_COLOR: Record<LogLevel, string> = {
  debug: 'text-slate-400',
  info: 'text-slate-200',
  warn: 'text-amber-300',
  error: 'text-red-400',
}

export function MigrationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: migration, isLoading, isError, error, refetch } = useMigration(id)
  const connections = useConnections()
  const start = useStartMigration()
  const cancel = useCancelMigration()
  const del = useDeleteMigration()
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Stream is meaningful once the job has run at all (not for a fresh draft).
  const streamEnabled = !!migration && migration.status !== 'draft'
  const { logs, progress, streaming } = useMigrationStream(id, {
    enabled: streamEnabled,
    onEnd: () => refetch(),
  })

  const connName = useMemo(() => {
    const map = new Map<string, string>()
    connections.data?.forEach((c) => map.set(c.id, c.name))
    return (cid: string) => map.get(cid) ?? 'Unknown'
  }, [connections.data])

  if (isLoading) return <PageLoader label="Loading migration…" />
  if (isError || !migration)
    return <ErrorState error={error} onRetry={refetch} />

  // Prefer the granular SSE progress while streaming; fall back to polled data.
  const processed = progress?.processed_rows ?? migration.processed_rows
  const total = progress?.total_rows ?? migration.total_rows
  const pct = progressPct(processed, total)
  const active = isActive(migration.status)

  async function action(
    fn: () => Promise<unknown>,
    okMsg: string,
  ): Promise<void> {
    try {
      await fn()
      toast.success(okMsg)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {migration.name}
            <MigrationStatusBadge status={migration.status} />
          </span>
        }
        description={migration.description || undefined}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/migrations">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <CanWrite>
              {isStartable(migration.status) && (
                <Button
                  size="sm"
                  loading={start.isPending}
                  onClick={() =>
                    action(
                      () => start.mutateAsync(migration.id),
                      'Migration started.',
                    )
                  }
                >
                  <Play className="h-4 w-4" />
                  {migration.status === 'draft' ? 'Start' : 'Restart'}
                </Button>
              )}
              {active && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={cancel.isPending}
                  onClick={() =>
                    action(
                      () => cancel.mutateAsync(migration.id),
                      'Cancellation requested.',
                    )
                  }
                >
                  <Ban className="h-4 w-4" />
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CanWrite>
          </div>
        }
      />

      {/* Route + progress overview */}
      <Card className="mb-5">
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5">
              <Database className="h-4 w-4 text-slate-400" />
              {connName(migration.source_connection_id)}
            </span>
            <ArrowRight className="h-4 w-4 text-slate-400" />
            <span className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5">
              <Database className="h-4 w-4 text-slate-400" />
              {connName(migration.target_connection_id)}
            </span>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">
                {formatNumber(processed)} / {formatNumber(total)} rows
              </span>
              <span className="text-slate-500">{pct}%</span>
            </div>
            <ProgressBar
              value={pct}
              tone={
                migration.status === 'failed'
                  ? 'danger'
                  : migration.status === 'completed'
                    ? 'success'
                    : 'info'
              }
              animated={active}
              className="h-2.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Meta label="Started" value={formatDateTime(migration.started_at)} />
            <Meta label="Finished" value={formatDateTime(migration.finished_at)} />
            <Meta
              label="Duration"
              value={formatDuration(migration.started_at, migration.finished_at)}
            />
            <Meta
              label="On conflict"
              value={String(migration.options?.on_conflict ?? 'error')}
            />
          </div>

          {migration.error_message && (
            <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
              {migration.error_message}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Options — editable while the migration is a draft */}
      <MigrationOptionsCard migration={migration} />

      {/* Tables */}
      <Card className="mb-5">
        <CardHeader title={`Tables (${migration.tables.length})`} />
        <Table>
          <Thead>
            <Tr>
              <Th>Source → Target</Th>
              <Th>Status</Th>
              <Th className="w-48">Progress</Th>
              <Th>Rows</Th>
            </Tr>
          </Thead>
          <Tbody>
            {[...migration.tables]
              .sort((a, b) => a.order_index - b.order_index)
              .map((t) => {
                const tpct = progressPct(t.rows_processed, t.rows_total)
                return (
                  <Tr key={t.id}>
                    <Td>
                      <span className="flex items-center gap-1.5 font-mono text-xs">
                        {t.source_table}
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        {t.target_table}
                      </span>
                      {t.error_message && (
                        <p className="mt-1 text-xs text-red-600">
                          {t.error_message}
                        </p>
                      )}
                    </Td>
                    <Td>
                      <TableStatusBadge status={t.status} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <ProgressBar
                          value={tpct}
                          tone={
                            t.status === 'failed'
                              ? 'danger'
                              : t.status === 'done'
                                ? 'success'
                                : 'info'
                          }
                          animated={t.status === 'running'}
                          className="w-28"
                        />
                        <span className="w-9 text-right text-xs text-slate-500">
                          {tpct}%
                        </span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-slate-500">
                      {formatNumber(t.rows_processed)} / {formatNumber(t.rows_total)}
                    </Td>
                  </Tr>
                )
              })}
          </Tbody>
        </Table>
      </Card>

      {/* Live log console */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Logs
            </span>
          }
          action={
            streaming ? (
              <Badge tone="info" dot>
                <Radio className="h-3 w-3 animate-pulse" /> Live
              </Badge>
            ) : (
              <Badge tone="neutral">{logs.length} lines</Badge>
            )
          }
        />
        <LogConsole logs={logs} status={migration.status} />
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete migration"
        message={
          <>
            Delete <strong>{migration.name}</strong> and its logs? This
            can&apos;t be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={() =>
          action(async () => {
            await del.mutateAsync(migration.id)
            navigate('/migrations')
          }, 'Migration deleted.')
        }
        onClose={() => setConfirmDelete(false)}
      />
    </>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 font-medium text-slate-800">{value}</p>
    </div>
  )
}

// ── Options panel ─────────────────────────────────────────────────────
// Editable only while the migration is still a draft (the backend rejects
// PATCH otherwise); read-only for everyone else and once it has run.
function MigrationOptionsCard({ migration }: { migration: MigrationDetail }) {
  const { canWrite } = useAuth()
  const update = useUpdateMigration(migration.id)

  const isDraft = migration.status === 'draft'
  const editable = isDraft && canWrite

  // The server's current values, with the documented defaults as a fallback.
  const saved = useMemo(
    () => ({
      batch_size: Number(migration.options?.batch_size ?? 1000),
      max_in_flight: Number(migration.options?.max_in_flight ?? 64),
      on_conflict: (migration.options?.on_conflict === 'skip'
        ? 'skip'
        : 'error') as 'error' | 'skip',
      create_tables: Boolean(migration.options?.create_tables),
    }),
    [migration.options],
  )

  const [batchSize, setBatchSize] = useState(saved.batch_size)
  const [maxInFlight, setMaxInFlight] = useState(saved.max_in_flight)
  const [onConflict, setOnConflict] = useState<'error' | 'skip'>(
    saved.on_conflict,
  )
  const [createTables, setCreateTables] = useState(saved.create_tables)

  // Peek at the target's tables so we can warn when it's empty and create is
  // off — only worth checking while the options can still be changed.
  const targetTablesQuery = useConnectionTables(
    migration.target_connection_id,
    editable,
  )
  const targetHasNoTables =
    !createTables &&
    !!targetTablesQuery.data &&
    targetTablesQuery.data.tables.length === 0

  const dirty =
    batchSize !== saved.batch_size ||
    maxInFlight !== saved.max_in_flight ||
    onConflict !== saved.on_conflict ||
    createTables !== saved.create_tables

  function reset() {
    setBatchSize(saved.batch_size)
    setMaxInFlight(saved.max_in_flight)
    setOnConflict(saved.on_conflict)
    setCreateTables(saved.create_tables)
  }

  async function save() {
    try {
      // PATCH replaces the whole options object — send every field.
      await update.mutateAsync({
        options: {
          batch_size: batchSize,
          max_in_flight: maxInFlight,
          on_conflict: onConflict,
          create_tables: createTables,
        },
      })
      toast.success('Options updated.')
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Card className="mb-5">
      <CardHeader
        title="Options"
        description={
          editable
            ? 'Tune how the copy runs. Changes are saved to the draft.'
            : isDraft
              ? 'You have read-only access to this migration.'
              : 'Options are locked once a migration leaves draft.'
        }
      />
      <CardBody className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Batch size"
            htmlFor="opt-batch"
            hint="Rows per insert batch (1–100,000)."
          >
            <Input
              id="opt-batch"
              type="number"
              min={1}
              max={100000}
              value={batchSize}
              disabled={!editable}
              onChange={(e) => setBatchSize(Number(e.target.value))}
            />
          </Field>
          <Field
            label="Max in-flight"
            htmlFor="opt-inflight"
            hint="Concurrent batches (1–2,000)."
          >
            <Input
              id="opt-inflight"
              type="number"
              min={1}
              max={2000}
              value={maxInFlight}
              disabled={!editable}
              onChange={(e) => setMaxInFlight(Number(e.target.value))}
            />
          </Field>
          <Field
            label="On conflict"
            htmlFor="opt-conflict"
            hint="Skip makes restarts idempotent."
          >
            <Select
              id="opt-conflict"
              value={onConflict}
              disabled={!editable}
              onChange={(e) => setOnConflict(e.target.value as 'error' | 'skip')}
            >
              <option value="error">Error on conflict</option>
              <option value="skip">Skip existing rows</option>
            </Select>
          </Field>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <label
            className={cn(
              'flex items-start gap-3',
              editable ? 'cursor-pointer' : 'cursor-not-allowed',
            )}
          >
            <input
              type="checkbox"
              checked={createTables}
              disabled={!editable}
              onChange={(e) => setCreateTables(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">
                Create target tables automatically
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                If a target table doesn&apos;t exist, create it from the source
                schema before copying. Leave unchecked if the target database
                already has tables.
              </span>
            </span>
          </label>

          {targetHasNoTables && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                The target database has no tables. Enable “Create target tables”
                or create them manually before running.
              </span>
            </div>
          )}
        </div>

        {editable && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              disabled={!dirty || update.isPending}
            >
              Reset
            </Button>
            <Button
              size="sm"
              onClick={save}
              loading={update.isPending}
              disabled={!dirty}
            >
              Save changes
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function LogConsole({
  logs,
  status,
}: {
  logs: { id: number; level: LogLevel; message: string; created_at: string }[]
  status: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  // Track whether the user is pinned to the bottom; only auto-scroll if so.
  function onScroll() {
    const el = ref.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  useEffect(() => {
    if (stickRef.current && ref.current)
      ref.current.scrollTop = ref.current.scrollHeight
  }, [logs])

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="max-h-96 overflow-y-auto rounded-b-xl bg-slate-900 px-4 py-3 font-mono text-xs leading-relaxed"
    >
      {logs.length === 0 ? (
        <p className="py-6 text-center text-slate-500">
          {status === 'draft'
            ? 'Not started yet — start the migration to see live logs.'
            : 'Waiting for log output…'}
        </p>
      ) : (
        logs.map((log) => (
          <div key={log.id} className="flex gap-3">
            <span className="shrink-0 text-slate-600">
              {new Date(log.created_at).toLocaleTimeString()}
            </span>
            <span
              className={cn(
                'shrink-0 uppercase',
                LOG_COLOR[log.level] ?? 'text-slate-300',
              )}
            >
              {log.level}
            </span>
            <span className={cn('whitespace-pre-wrap break-all', LOG_COLOR[log.level])}>
              {log.message}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
