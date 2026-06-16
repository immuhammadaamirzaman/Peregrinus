import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Database,
  Plus,
  Table2,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  useConnectionColumns,
  useConnections,
  useConnectionTables,
} from '@/hooks/useConnections'
import { useCreateMigration, useStartMigration } from '@/hooks/useMigrations'
import { DB_TYPE_LABELS, FILTER_OPS } from '@/constants/db'
import { getApiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { LIST_OPS, toFilterCondition } from '@/lib/filters'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { Stepper } from '@/components/ui/Stepper'
import { Textarea } from '@/components/ui/Textarea'
import type {
  FilterOp,
  MigrationCreate,
  MigrationTableSpec,
} from '@/types/api'

const STEPS = ['Details', 'Tables', 'Options & review']

interface FilterRow {
  column: string
  op: FilterOp
  value: string
}

interface TableConfig {
  target_table: string
  allColumns: boolean
  selected_columns: string[]
  filters: FilterRow[]
}

function defaultConfig(source: string): TableConfig {
  return {
    target_table: source,
    allColumns: true,
    selected_columns: [],
    filters: [],
  }
}

export function MigrationCreatePage() {
  const navigate = useNavigate()
  const connections = useConnections()
  const createMutation = useCreateMigration()
  const startMutation = useStartMigration()

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [batchSize, setBatchSize] = useState(1000)
  const [maxInFlight, setMaxInFlight] = useState(64)
  const [onConflict, setOnConflict] = useState<'error' | 'skip'>('error')
  const [createTables, setCreateTables] = useState(false)
  // Per-source-table config, keyed by source table name. Presence = included.
  const [configs, setConfigs] = useState<Record<string, TableConfig>>({})
  const [error, setError] = useState<string | null>(null)

  const tablesQuery = useConnectionTables(sourceId || undefined, step >= 1)
  // On the options step, peek at the target's tables so we can warn when it's
  // empty and "create tables" is off — that migration would fail at run time.
  const targetTablesQuery = useConnectionTables(targetId || undefined, step >= 2)
  const sourceConn = connections.data?.find((c) => c.id === sourceId)
  const targetConn = connections.data?.find((c) => c.id === targetId)
  const targetHasNoTables =
    !createTables &&
    !!targetTablesQuery.data &&
    targetTablesQuery.data.tables.length === 0

  // Reset table selection when the source connection changes.
  useEffect(() => {
    setConfigs({})
  }, [sourceId])

  const includedTables = useMemo(() => Object.keys(configs), [configs])

  function toggleTable(table: string) {
    setConfigs((prev) => {
      const next = { ...prev }
      if (next[table]) delete next[table]
      else next[table] = defaultConfig(table)
      return next
    })
  }

  function updateConfig(table: string, patch: Partial<TableConfig>) {
    setConfigs((prev) => ({ ...prev, [table]: { ...prev[table], ...patch } }))
  }

  function canAdvance(): string | null {
    if (step === 0) {
      if (!name.trim()) return 'Give the migration a name.'
      if (!sourceId) return 'Select a source connection.'
      if (!targetId) return 'Select a target connection.'
      return null
    }
    if (step === 1) {
      if (includedTables.length === 0)
        return 'Select at least one table to copy.'
      for (const t of includedTables) {
        const c = configs[t]
        if (!c.target_table.trim())
          return `Set a target table for "${t}".`
        if (!c.allColumns && c.selected_columns.length === 0)
          return `Select at least one column for "${t}" (or choose all columns).`
      }
      return null
    }
    return null
  }

  function next() {
    const err = canAdvance()
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  function back() {
    setError(null)
    setStep((s) => Math.max(0, s - 1))
  }

  function buildPayload(): MigrationCreate {
    const tables: MigrationTableSpec[] = includedTables.map((source) => {
      const c = configs[source]
      const filters = c.filters
        .filter((f) => f.column.trim())
        .map(toFilterCondition)
      return {
        source_table: source,
        target_table: c.target_table.trim() || null,
        selected_columns: c.allColumns ? null : c.selected_columns,
        filters: filters.length ? filters : null,
      }
    })
    return {
      name: name.trim(),
      description: description.trim() || null,
      source_connection_id: sourceId,
      target_connection_id: targetId,
      tables,
      options: {
        batch_size: batchSize,
        max_in_flight: maxInFlight,
        on_conflict: onConflict,
        create_tables: createTables,
      },
    }
  }

  async function submit(startNow: boolean) {
    setError(null)
    try {
      const created = await createMutation.mutateAsync(buildPayload())
      if (startNow) {
        try {
          await startMutation.mutateAsync(created.id)
          toast.success('Migration created and started.')
        } catch (err) {
          toast.error(
            `Created, but could not start: ${getApiErrorMessage(err)}`,
          )
        }
      } else {
        toast.success('Migration created as draft.')
      }
      navigate(`/migrations/${created.id}`)
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  const writableConnections = connections.data ?? []
  const busy = createMutation.isPending || startMutation.isPending

  return (
    <>
      <PageHeader
        title="New migration"
        description="Copy tables from a source database into a target database."
        actions={
          <Link to="/migrations">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <Card className="mb-5 px-5 py-4">
        <Stepper steps={STEPS} current={step} />
      </Card>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Step 1: Details ─────────────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <CardHeader title="Migration details" description="Name the job and choose endpoints." />
          <CardBody className="space-y-5">
            <Field label="Name" htmlFor="name" required>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Prod → Staging nightly copy"
              />
            </Field>

            <Field label="Description" htmlFor="description">
              <Textarea
                id="description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes about this migration."
              />
            </Field>

            {writableConnections.length < 1 ? (
              <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
                You need at least one connection.{' '}
                <Link to="/connections" className="font-medium underline">
                  Create a connection
                </Link>{' '}
                first.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Source connection" htmlFor="source" required>
                  <Select
                    id="source"
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                  >
                    <option value="">Select source…</option>
                    {writableConnections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({DB_TYPE_LABELS[c.db_type]})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Target connection" htmlFor="target" required>
                  <Select
                    id="target"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                  >
                    <option value="">Select target…</option>
                    {writableConnections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({DB_TYPE_LABELS[c.db_type]})
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
              Target tables/collections must already exist — the engine inserts
              rows, it does not create the target schema.
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Step 2: Tables ──────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader
            title="Select tables"
            description={
              sourceConn
                ? `Tables discovered on "${sourceConn.name}".`
                : 'Choose a source connection first.'
            }
            action={
              <Badge tone="info">{includedTables.length} selected</Badge>
            }
          />
          <CardBody>
            {tablesQuery.isLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                <Spinner /> Discovering tables…
              </div>
            ) : tablesQuery.isError ? (
              <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
                Could not list tables: {getApiErrorMessage(tablesQuery.error)}
              </div>
            ) : !tablesQuery.data || tablesQuery.data.tables.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">
                No tables found on this connection.
              </p>
            ) : (
              <div className="space-y-2">
                {tablesQuery.data.tables.map((table) => (
                  <TableConfigRow
                    key={table}
                    sourceId={sourceId}
                    table={table}
                    config={configs[table]}
                    onToggle={() => toggleTable(table)}
                    onChange={(patch) => updateConfig(table, patch)}
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ── Step 3: Options & review ────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Options" description="Tune how the copy runs." />
            <CardBody className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field
                  label="Batch size"
                  htmlFor="batch"
                  hint="Rows per insert batch (1–100,000)."
                >
                  <Input
                    id="batch"
                    type="number"
                    min={1}
                    max={100000}
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                  />
                </Field>
                <Field
                  label="Max in-flight"
                  htmlFor="inflight"
                  hint="Concurrent batches (1–2,000)."
                >
                  <Input
                    id="inflight"
                    type="number"
                    min={1}
                    max={2000}
                    value={maxInFlight}
                    onChange={(e) => setMaxInFlight(Number(e.target.value))}
                  />
                </Field>
                <Field
                  label="On conflict"
                  htmlFor="conflict"
                  hint="Skip makes restarts idempotent."
                >
                  <Select
                    id="conflict"
                    value={onConflict}
                    onChange={(e) =>
                      setOnConflict(e.target.value as 'error' | 'skip')
                    }
                  >
                    <option value="error">Error on conflict</option>
                    <option value="skip">Skip existing rows</option>
                  </Select>
                </Field>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={createTables}
                    onChange={(e) => setCreateTables(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">
                      Create target tables automatically
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      If a target table doesn&apos;t exist, create it from the
                      source schema before copying. Leave unchecked if the
                      target database already has tables.
                    </span>
                  </span>
                </label>

                {targetHasNoTables && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      The target database has no tables. Enable “Create target
                      tables” or create them manually before running.
                    </span>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Review" />
            <CardBody className="space-y-4 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ReviewItem label="Name" value={name} />
                <ReviewItem
                  label="Route"
                  value={
                    <span className="flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5 text-slate-400" />
                      {sourceConn?.name}
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      {targetConn?.name}
                    </span>
                  }
                />
              </div>
              <div>
                <p className="mb-1.5 font-medium text-slate-700">
                  Tables ({includedTables.length})
                </p>
                <ul className="space-y-1">
                  {includedTables.map((t) => {
                    const c = configs[t]
                    return (
                      <li
                        key={t}
                        className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-xs"
                      >
                        <Table2 className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-mono">{t}</span>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <span className="font-mono">{c.target_table || t}</span>
                        <span className="ml-auto text-slate-400">
                          {c.allColumns
                            ? 'all columns'
                            : `${c.selected_columns.length} cols`}
                          {c.filters.filter((f) => f.column.trim()).length
                            ? ` · ${c.filters.filter((f) => f.column.trim()).length} filter(s)`
                            : ''}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ── Footer nav ──────────────────────────────────────────────── */}
      <div className="mt-6 flex items-center justify-between">
        <Button variant="outline" onClick={back} disabled={step === 0 || busy}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => submit(false)}
              loading={busy}
            >
              Save as draft
            </Button>
            <Button onClick={() => submit(true)} loading={busy}>
              Create &amp; start
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

function ReviewItem({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 font-medium text-slate-800">{value}</div>
    </div>
  )
}

// ── Per-table configuration row ───────────────────────────────────────
function TableConfigRow({
  sourceId,
  table,
  config,
  onToggle,
  onChange,
}: {
  sourceId: string
  table: string
  config: TableConfig | undefined
  onToggle: () => void
  onChange: (patch: Partial<TableConfig>) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const included = !!config
  const wantColumns = included && !config!.allColumns
  const columnsQuery = useConnectionColumns(
    sourceId,
    table,
    included && (wantColumns || expanded),
  )
  const columnNames = columnsQuery.data?.columns.map((c) => c.name) ?? []

  function toggleColumn(name: string) {
    if (!config) return
    const set = new Set(config.selected_columns)
    if (set.has(name)) set.delete(name)
    else set.add(name)
    onChange({ selected_columns: [...set] })
  }

  function addFilter() {
    if (!config) return
    onChange({
      filters: [...config.filters, { column: '', op: 'eq', value: '' }],
    })
  }
  function updateFilter(i: number, patch: Partial<FilterRow>) {
    if (!config) return
    const filters = config.filters.map((f, idx) =>
      idx === i ? { ...f, ...patch } : f,
    )
    onChange({ filters })
  }
  function removeFilter(i: number) {
    if (!config) return
    onChange({ filters: config.filters.filter((_, idx) => idx !== i) })
  }

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        included ? 'border-brand-200 bg-brand-50/30' : 'border-slate-200',
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <input
          type="checkbox"
          checked={included}
          onChange={onToggle}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <Table2 className="h-4 w-4 text-slate-400" />
        <span className="font-mono text-sm text-slate-800">{table}</span>
        {included && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            Configure
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {included && expanded && (
        <div className="space-y-4 border-t border-brand-100 px-3 py-3">
          <Field label="Target table" htmlFor={`tt-${table}`}>
            <Input
              id={`tt-${table}`}
              value={config!.target_table}
              onChange={(e) => onChange({ target_table: e.target.value })}
              placeholder={table}
              className="font-mono text-sm"
            />
          </Field>

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Columns</p>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={config!.allColumns}
                  onChange={() => onChange({ allColumns: true })}
                  className="text-brand-600 focus:ring-brand-500"
                />
                All columns
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={!config!.allColumns}
                  onChange={() => onChange({ allColumns: false })}
                  className="text-brand-600 focus:ring-brand-500"
                />
                Select columns
              </label>
            </div>

            {!config!.allColumns && (
              <div className="mt-2">
                {columnsQuery.isLoading ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
                    <Spinner className="h-4 w-4" /> Loading columns…
                  </div>
                ) : columnsQuery.isError ? (
                  <p className="text-xs text-red-600">
                    {getApiErrorMessage(columnsQuery.error)}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {columnNames.map((name) => {
                      const on = config!.selected_columns.includes(name)
                      return (
                        <button
                          type="button"
                          key={name}
                          onClick={() => toggleColumn(name)}
                          className={cn(
                            'rounded-full px-2.5 py-1 font-mono text-xs ring-1 ring-inset transition-colors',
                            on
                              ? 'bg-brand-600 text-white ring-brand-600'
                              : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-300',
                          )}
                        >
                          {name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                Filters{' '}
                <span className="font-normal text-slate-400">
                  (AND-combined)
                </span>
              </p>
              <Button size="sm" variant="ghost" type="button" onClick={addFilter}>
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            {config!.filters.length === 0 ? (
              <p className="text-xs text-slate-400">
                No filters — the whole table is copied.
              </p>
            ) : (
              <div className="space-y-2">
                <datalist id={`cols-${table}`}>
                  {columnNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                {config!.filters.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      list={`cols-${table}`}
                      value={f.column}
                      onChange={(e) => updateFilter(i, { column: e.target.value })}
                      placeholder="column"
                      className="h-9 flex-1 font-mono text-xs"
                    />
                    <Select
                      value={f.op}
                      onChange={(e) =>
                        updateFilter(i, { op: e.target.value as FilterOp })
                      }
                      className="h-9 w-36 text-xs"
                    >
                      {FILTER_OPS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      value={f.value}
                      onChange={(e) => updateFilter(i, { value: e.target.value })}
                      placeholder={LIST_OPS.includes(f.op) ? 'a, b, c' : 'value'}
                      className="h-9 flex-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeFilter(i)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove filter"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
