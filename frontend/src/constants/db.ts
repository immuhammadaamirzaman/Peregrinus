/** Static metadata for DB engines, SSL posture, filters, and statuses. */
import type {
  DBType,
  FilterOp,
  MigrationStatus,
  SSLMode,
  TableStatus,
  UserStatus,
} from '@/types/api'

export interface DbTypeMeta {
  value: DBType
  label: string
  defaultPort: number | null
  /** Whether host/port/username/password apply (false for SQLite). */
  network: boolean
  /** Engines fully supported in phase 1 (test + discovery + migrate). */
  supported: boolean
  hint: string
}

/** Mirrors app/services/schema_discovery.py DEFAULT_PORTS + phase-1 support. */
export const DB_TYPES: DbTypeMeta[] = [
  {
    value: 'postgres',
    label: 'PostgreSQL',
    defaultPort: 5432,
    network: true,
    supported: true,
    hint: 'Host, port, database, user & password required.',
  },
  {
    value: 'mysql',
    label: 'MySQL',
    defaultPort: 3306,
    network: true,
    supported: true,
    hint: 'Host, port, database, user & password required.',
  },
  {
    value: 'mongodb',
    label: 'MongoDB',
    defaultPort: 27017,
    network: true,
    supported: true,
    hint: 'Provide host/port or a connection URI in extra params.',
  },
  {
    value: 'sqlite',
    label: 'SQLite',
    defaultPort: null,
    network: false,
    supported: true,
    hint: 'Database is the file path on the API server; no host needed.',
  },
  {
    value: 'mssql',
    label: 'SQL Server',
    defaultPort: 1433,
    network: true,
    supported: false,
    hint: 'Reserved for a later phase — not yet supported.',
  },
]

export const DB_TYPE_LABELS: Record<DBType, string> = Object.fromEntries(
  DB_TYPES.map((d) => [d.value, d.label]),
) as Record<DBType, string>

export function dbMeta(t: DBType): DbTypeMeta {
  return DB_TYPES.find((d) => d.value === t) ?? DB_TYPES[0]
}

export const SSL_MODES: { value: SSLMode; label: string }[] = [
  { value: 'disable', label: 'Disable' },
  { value: 'require', label: 'Require' },
  { value: 'verify-ca', label: 'Verify CA' },
  { value: 'verify-full', label: 'Verify Full' },
]

export const FILTER_OPS: { value: FilterOp; label: string; list: boolean }[] = [
  { value: 'eq', label: '= equals', list: false },
  { value: 'ne', label: '≠ not equals', list: false },
  { value: 'gt', label: '> greater than', list: false },
  { value: 'gte', label: '≥ greater or equal', list: false },
  { value: 'lt', label: '< less than', list: false },
  { value: 'lte', label: '≤ less or equal', list: false },
  { value: 'like', label: 'like (pattern)', list: false },
  { value: 'in', label: 'in (list)', list: true },
  { value: 'nin', label: 'not in (list)', list: true },
]

// ── Status → visual treatment (Badge tone) ──────────────────────────
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export const MIGRATION_STATUS_TONE: Record<MigrationStatus, Tone> = {
  draft: 'neutral',
  pending: 'info',
  running: 'info',
  completed: 'success',
  failed: 'danger',
  cancelled: 'warning',
}

export const TABLE_STATUS_TONE: Record<TableStatus, Tone> = {
  pending: 'neutral',
  running: 'info',
  done: 'success',
  failed: 'danger',
  skipped: 'warning',
}

export const USER_STATUS_TONE: Record<UserStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  disabled: 'neutral',
}

/** Statuses from which a migration may be (re)started — mirrors backend. */
export const STARTABLE: MigrationStatus[] = ['draft', 'failed', 'cancelled']
export const TERMINAL: MigrationStatus[] = ['completed', 'failed', 'cancelled']

export function isStartable(s: MigrationStatus): boolean {
  return STARTABLE.includes(s)
}
export function isTerminal(s: MigrationStatus): boolean {
  return TERMINAL.includes(s)
}
export function isActive(s: MigrationStatus): boolean {
  return s === 'pending' || s === 'running'
}
