import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
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
import { MOTION_KEEP } from '@/constants/motion'
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
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorState } from '@/components/ui/ErrorState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Reveal } from '@/components/ui/Motion'
import { PageLoader } from '@/components/ui/Spinner'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table'
import type { LogLevel, MigrationDetail } from '@/types/api'

/**
 * Log line colours, on the `code-bg` surface rather than the page surface.
 * Previously these were `text-slate-400` / `text-slate-200`, chosen for a dark
 * console — but the console itself was rendered on `surface-secondary`, which is
 * near-white in light themes, so debug and info text was effectively invisible.
 */
const LOG_LEVEL_CLASS: Record<LogLevel, string> = {
  debug: 'text-code-fg/55',
  info: 'text-code-fg',
  warn: 'text-warning',
  error: 'text-error',
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
  if (isError || !migration) return <ErrorState error={error} onRetry={refetch} />

  // Prefer the granular SSE progress while streaming; fall back to polled data.
  const processed = progress?.processed_rows ?? migration.processed_rows
  const total = progress?.total_rows ?? migration.total_rows
  const pct = progressPct(processed, total)
  const active = isActive(migration.status)

  async function action(fn: () => Promise<unknown>, okMsg: string): Promise<void> {
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
          <span className="flex flex-wrap items-center gap-3">
            {migration.name}
            <MigrationStatusBadge status={migration.status} />
          </span>
        }
        description={migration.description || undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
                variant="ghostDanger"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete migration"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CanWrite>
          </div>
        }
      />

      {/* Route + progress overview */}
      <Reveal>
        <Card className="mb-5">
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <ConnPill name={connName(migration.source_connection_id)} />
              <ArrowRight className="h-4 w-4 shrink-0 text-faint" />
              <ConnPill name={connName(migration.target_connection_id)} />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-ink">
                  {formatNumber(processed)} / {formatNumber(total)} rows
                </span>
                <span className="text-muted">{pct}%</span>
              </div>
              <ProgressBar
                value={pct}
                label="Overall migration progress"
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
              <Alert tone="error">{migration.error_message}</Alert>
            )}
          </CardBody>
        </Card>
      </Reveal>

      {/* Options — editable while the migration is a draft */}
      <MigrationOptionsCard migration={migration} />

      {/* Tables */}
      <Card className="mb-5 overflow-hidden">
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
                      <span className="flex items-center gap-1.5 font-mono text-xs text-ink">
                        {t.source_table}
                        <ArrowRight className="h-3 w-3 shrink-0 text-faint" />
                        {t.target_table}
                      </span>
                      {t.error_message && (
                        <p className="mt-1 text-xs text-error">{t.error_message}</p>
                      )}
                    </Td>
                    <Td>
                      <TableStatusBadge status={t.status} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <ProgressBar
                          value={tpct}
                          label={`Progress for ${t.source_table}`}
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
                        <span className="w-9 text-right text-xs text-muted">
                          {tpct}%
                        </span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-muted">
                      {formatNumber(t.rows_processed)} / {formatNumber(t.rows_total)}
                    </Td>
                  </Tr>
                )
              })}
          </Tbody>
        </Table>
      </Card>

      {/* Live log console */}
      <Card className="overflow-hidden">
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
                {/* MOTION_KEEP: this pulse is the only signal that the stream is
                    still connected, so it survives the motion opt-out. */}
                <Radio className={cn('h-3 w-3 animate-breathe', MOTION_KEEP)} />
                Live
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
            Delete <strong>{migration.name}</strong> and its logs? This can&apos;t
            be undone.
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

function ConnPill({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg bg-surface-hover px-3 py-1.5 text-muted">
      <Database className="h-4 w-4 shrink-0 text-faint" />
      {name}
    </span>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-0.5 font-medium text-ink">{value}</p>
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
  const [onConflict, setOnConflict] = useState<'error' | 'skip'>(saved.on_conflict)
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

        <div className="border-t border-line pt-4">
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
              className="mt-0.5 h-4 w-4 rounded border-border-subtle disabled:cursor-not-allowed disabled:opacity-60"
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                Create target tables automatically
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                If a target table doesn&apos;t exist, create it from the source
                schema before copying. Leave unchecked if the target database
                already has tables.
              </span>
            </span>
          </label>

          {targetHasNoTables && (
            <Alert tone="warning" className="mt-3">
              The target database has no tables. Enable “Create target tables” or
              create them manually before running.
            </Alert>
          )}
        </div>

        {editable && (
          <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
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
      className="max-h-96 overflow-y-auto bg-code-bg px-4 py-3 font-mono text-xs leading-relaxed text-code-fg"
    >
      {logs.length === 0 ? (
        <p className="py-6 text-center text-code-fg/55">
          {status === 'draft'
            ? 'Not started yet — start the migration to see live logs.'
            : 'Waiting for log output…'}
        </p>
      ) : (
        // Deliberately no entrance animation on log lines. This list re-renders
        // on every SSE frame, and animating each arrival would both look like
        // noise and put avoidable work on the main thread during a migration.
        logs.map((log) => (
          <div key={log.id} className="flex gap-3">
            <span className="shrink-0 text-code-fg/45">
              {new Date(log.created_at).toLocaleTimeString()}
            </span>
            <span
              className={cn('w-12 shrink-0 uppercase', LOG_LEVEL_CLASS[log.level])}
            >
              {log.level}
            </span>
            <span
              className={cn(
                'whitespace-pre-wrap break-all',
                LOG_LEVEL_CLASS[log.level],
              )}
            >
              {log.message}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
