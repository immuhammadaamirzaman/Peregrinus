/**
 * TypeScript mirrors of the backend Pydantic schemas (app/schemas/*).
 * Enums are modelled as string-literal unions to match the backend's StrEnum
 * wire format and to satisfy `erasableSyntaxOnly` (no TS `enum`).
 */

// ── Enums (app/models/enums.py) ─────────────────────────────────────
export type Role = 'admin' | 'user' | 'guest'
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'disabled'
export type DBType = 'postgres' | 'mysql' | 'mongodb' | 'sqlite' | 'mssql'
export type SSLMode = 'disable' | 'require' | 'verify-ca' | 'verify-full'
export type MigrationStatus =
  | 'draft'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
export type TableStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type FilterOp =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'in'
  | 'nin'

// ── Auth ────────────────────────────────────────────────────────────
// The refresh token is delivered as an httpOnly cookie, never in the body.
export interface Token {
  access_token: string
  token_type: string
}

export interface RegisterRequest {
  email: string
  password: string
  full_name?: string | null
}

// ── Users ───────────────────────────────────────────────────────────
export interface UserRead {
  id: string
  email: string
  full_name: string | null
  role: Role
  status: UserStatus
  last_login_at: string | null
  created_at: string
}

// ── Connections ─────────────────────────────────────────────────────
export interface ConnectionBase {
  db_type: DBType
  host?: string | null
  port?: number | null
  database_name: string
  username?: string | null
  ssl_mode: SSLMode
  extra_params: Record<string, unknown>
}

export interface ConnectionCreate extends ConnectionBase {
  name: string
  password?: string | null
}

export interface ConnectionUpdate {
  name?: string
  host?: string | null
  port?: number | null
  database_name?: string
  username?: string | null
  password?: string | null
  ssl_mode?: SSLMode
  extra_params?: Record<string, unknown>
}

export interface ConnectionTestRequest extends ConnectionBase {
  password?: string | null
}

export interface ConnectionRead {
  id: string
  name: string
  db_type: DBType
  host: string | null
  port: number | null
  database_name: string
  username: string | null
  ssl_mode: SSLMode
  extra_params: Record<string, unknown>
  owner_id: string
  created_at: string
  updated_at: string
  has_password: boolean
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
  server_version?: string | null
  latency_ms?: number | null
}

export interface ColumnInfo {
  name: string
  type: string
  nullable?: boolean | null
  primary_key: boolean
}

export interface TableColumns {
  table: string
  columns: ColumnInfo[]
}

export interface TableList {
  db_type: DBType
  database: string
  tables: string[]
}

// ── Migrations ──────────────────────────────────────────────────────
export interface FilterCondition {
  column: string
  op: FilterOp
  value: unknown
}

export interface MigrationOptions {
  batch_size: number
  max_in_flight: number
  on_conflict: 'error' | 'skip'
  /** Auto-create missing target tables from the source schema. */
  create_tables: boolean
}

export interface MigrationTableSpec {
  source_table: string
  target_table?: string | null
  selected_columns?: string[] | null
  column_mapping?: Record<string, string> | null
  filters?: FilterCondition[] | null
}

export interface MigrationCreate {
  name: string
  description?: string | null
  source_connection_id: string
  target_connection_id: string
  tables: MigrationTableSpec[]
  options?: MigrationOptions
}

export interface MigrationUpdate {
  name?: string
  description?: string | null
  options?: MigrationOptions
  tables?: MigrationTableSpec[]
}

export interface MigrationTableRead {
  id: string
  source_table: string
  target_table: string
  selected_columns: string[] | null
  column_mapping: Record<string, string> | null
  filters: Array<Record<string, unknown>> | null
  order_index: number
  status: TableStatus
  rows_total: number
  rows_processed: number
  error_message: string | null
}

export interface MigrationRead {
  id: string
  name: string
  description: string | null
  source_connection_id: string
  target_connection_id: string
  status: MigrationStatus
  options: Record<string, unknown>
  total_rows: number
  processed_rows: number
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export interface MigrationDetail extends MigrationRead {
  tables: MigrationTableRead[]
}

export interface MigrationLogRead {
  id: number
  level: LogLevel
  message: string
  context: Record<string, unknown> | null
  created_at: string
}

// ── SSE stream payloads (app/routers/stream.py) ─────────────────────
export interface StreamLogEvent {
  id: number
  level: LogLevel
  message: string
  created_at: string
}

export interface StreamStatusEvent {
  status: MigrationStatus
  processed_rows: number
  total_rows: number
}

// ── Error envelope (app/core/exceptions.py) ─────────────────────────
export interface ApiErrorBody {
  error?: { code: string; detail: string }
  // FastAPI request-validation errors use `detail` (string or list).
  detail?: string | Array<{ msg: string; loc: (string | number)[] }>
}
