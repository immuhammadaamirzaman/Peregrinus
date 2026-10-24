import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plug } from 'lucide-react'
import { toast } from 'sonner'

import { connectionsApi } from '@/api/connections'
import {
  useCreateConnection,
  useUpdateConnection,
} from '@/hooks/useConnections'
import {
  DB_TYPES,
  DEFAULT_SNOWFLAKE_SCHEMA,
  SSL_MODES,
  dbMeta,
} from '@/constants/db'
import { getApiErrorMessage } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import type {
  ConnectionCreate,
  ConnectionRead,
  ConnectionTestResult,
  DBType,
  SSLMode,
} from '@/types/api'

// Only phase-1 engines are selectable.
const SELECTABLE = DB_TYPES.filter((d) => d.supported)

// Snowflake addresses objects as database.schema.table and runs every query on
// a named virtual warehouse, so these three travel in extra_params. Validated
// here with the same alphabet the backend enforces, since they are interpolated
// into SQL as unquoted identifiers rather than bound as parameters.
const SNOWFLAKE_IDENT = /^[A-Za-z_][A-Za-z0-9_$]*$/
const identField = (label: string) =>
  z
    .string()
    .max(255)
    .optional()
    .refine(
      (v) => !v || SNOWFLAKE_IDENT.test(v),
      `${label} must be a plain unquoted identifier`,
    )

const schema = z
  .object({
    name: z.string().min(1, 'Name is required').max(120),
    db_type: z.enum(['postgres', 'mysql', 'mongodb', 'sqlite', 'snowflake']),
    host: z.string().max(255).optional(),
    warehouse: identField('Warehouse'),
    sf_schema: identField('Schema'),
    role: identField('Role'),
    port: z
      .string()
      .optional()
      .refine((v) => !v || /^\d+$/.test(v), 'Port must be a number')
      .refine(
        (v) => !v || (Number(v) >= 1 && Number(v) <= 65535),
        'Port must be 1–65535',
      ),
    database_name: z.string().min(1, 'Database is required').max(255),
    username: z.string().max(255).optional(),
    password: z.string().max(512).optional(),
    ssl_mode: z.enum(['disable', 'require', 'verify-ca', 'verify-full']),
    extra_params: z
      .string()
      .optional()
      .refine((v) => {
        if (!v || !v.trim()) return true
        try {
          const parsed = JSON.parse(v)
          return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        } catch {
          return false
        }
      }, 'Must be a valid JSON object'),
  })
  .superRefine((val, ctx) => {
    const meta = dbMeta(val.db_type)
    if (meta.network && (val.db_type === 'postgres' || val.db_type === 'mysql') && !val.host) {
      ctx.addIssue({
        code: 'custom',
        message: `Host is required for ${meta.label}`,
        path: ['host'],
      })
    }
    if (val.db_type === 'mongodb' && !val.host) {
      const params = safeJson(val.extra_params)
      if (!params?.uri) {
        ctx.addIssue({
          code: 'custom',
          message: 'Provide a host or a "uri" in advanced params',
          path: ['host'],
        })
      }
    }
    if (val.db_type === 'snowflake') {
      if (!val.host) {
        ctx.addIssue({
          code: 'custom',
          message: 'Account identifier is required (e.g. myorg-acct123)',
          path: ['host'],
        })
      }
      if (!val.username) {
        ctx.addIssue({
          code: 'custom',
          message: 'Username is required for Snowflake',
          path: ['username'],
        })
      }
      // Without a warehouse the login still succeeds, then every query fails
      // with "No active warehouse selected" — so require it up front.
      if (!val.warehouse) {
        ctx.addIssue({
          code: 'custom',
          message: 'Warehouse is required — it runs the queries',
          path: ['warehouse'],
        })
      }
    }
  })

type FormValues = z.infer<typeof schema>

function safeJson(text?: string): Record<string, unknown> | null {
  if (!text || !text.trim()) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Snowflake's dedicated inputs are the complete set of extras the backend
 * allows for it, so they replace the free-form JSON box rather than merging
 * with it. Blank values are omitted so the backend applies its own defaults.
 */
function buildExtraParams(v: FormValues): Record<string, unknown> {
  if (dbMeta(v.db_type).accountBased) {
    const params: Record<string, unknown> = {}
    if (v.warehouse) params.warehouse = v.warehouse
    if (v.sf_schema) params.schema = v.sf_schema
    if (v.role) params.role = v.role
    return params
  }
  return safeJson(v.extra_params) ?? {}
}

function buildConnFields(v: FormValues) {
  const meta = dbMeta(v.db_type)
  return {
    db_type: v.db_type as DBType,
    host: meta.network ? v.host || null : null,
    // Snowflake is HTTPS on 443 and derives its endpoint from the account
    // identifier; the backend rejects any other port outright.
    port: meta.network && !meta.accountBased && v.port ? Number(v.port) : null,
    database_name: v.database_name,
    username: meta.network ? v.username || null : null,
    ssl_mode: v.ssl_mode as SSLMode,
    extra_params: buildExtraParams(v),
  }
}

interface Props {
  open: boolean
  onClose: () => void
  /** Pass an existing connection to edit; omit to create. */
  connection?: ConnectionRead | null
}

export function ConnectionFormModal({ open, onClose, connection }: Props) {
  const isEdit = !!connection
  const create = useCreateConnection()
  const update = useUpdateConnection(connection?.id ?? '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      db_type: 'postgres',
      host: '',
      port: '',
      database_name: '',
      username: '',
      password: '',
      ssl_mode: 'disable',
      extra_params: '',
      warehouse: '',
      sf_schema: '',
      role: '',
    },
  })

  // (Re)seed the form whenever the modal opens or the target changes.
  useEffect(() => {
    if (!open) return
    setTestResult(null)
    if (connection) {
      const params = connection.extra_params ?? {}
      const accountBased = dbMeta(connection.db_type).accountBased
      reset({
        name: connection.name,
        db_type: connection.db_type as FormValues['db_type'],
        host: connection.host ?? '',
        port: connection.port ? String(connection.port) : '',
        database_name: connection.database_name,
        username: connection.username ?? '',
        password: '',
        ssl_mode: connection.ssl_mode,
        // For account-based engines these extras are shown as real inputs, so
        // keep them out of the JSON box to avoid two editors for one value.
        extra_params:
          !accountBased && Object.keys(params).length
            ? JSON.stringify(params, null, 2)
            : '',
        warehouse: typeof params.warehouse === 'string' ? params.warehouse : '',
        sf_schema: typeof params.schema === 'string' ? params.schema : '',
        role: typeof params.role === 'string' ? params.role : '',
      })
    } else {
      reset({
        name: '',
        db_type: 'postgres',
        host: '',
        port: '5432',
        database_name: '',
        username: '',
        password: '',
        ssl_mode: 'disable',
        extra_params: '',
        warehouse: '',
        sf_schema: '',
        role: '',
      })
    }
  }, [open, connection, reset])

  const dbType = watch('db_type')
  const meta = dbMeta(dbType)

  // Auto-fill the default port when switching engine (create mode only, and
  // only if the port is empty or still a known default).
  useEffect(() => {
    if (isEdit) return
    const current = getValues('port')
    const knownDefaults = DB_TYPES.map((d) => String(d.defaultPort ?? ''))
    if (!current || knownDefaults.includes(current)) {
      setValue('port', meta.defaultPort ? String(meta.defaultPort) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbType])

  async function handleTest() {
    setTestResult(null)
    const values = getValues()
    // Light client checks before hitting the network.
    if (!values.database_name) {
      toast.error('Enter a database name before testing.')
      return
    }
    if (meta.accountBased && !values.warehouse) {
      toast.error('Enter a warehouse before testing.')
      return
    }
    setTesting(true)
    try {
      const result = await connectionsApi.testConfig({
        ...buildConnFields(values),
        password: values.password || null,
      })
      setTestResult(result)
    } catch (err) {
      setTestResult({ ok: false, message: getApiErrorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit && connection) {
        // Only send password when the user typed a new one.
        await update.mutateAsync({
          name: values.name,
          host: meta.network ? values.host || null : null,
          port:
            meta.network && !meta.accountBased && values.port
              ? Number(values.port)
              : null,
          database_name: values.database_name,
          username: meta.network ? values.username || null : null,
          ssl_mode: values.ssl_mode as SSLMode,
          extra_params: buildExtraParams(values),
          ...(values.password ? { password: values.password } : {}),
        })
        toast.success('Connection updated.')
      } else {
        const payload: ConnectionCreate = {
          name: values.name,
          ...buildConnFields(values),
          password: values.password || null,
        }
        await create.mutateAsync(payload)
        toast.success('Connection created.')
      }
      onClose()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit connection' : 'New connection'}
      description="Credentials are encrypted at rest and never returned by the API."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={handleTest}
            loading={testing}
            type="button"
          >
            <Plug className="h-4 w-4" />
            Test connection
          </Button>
          <Button onClick={onSubmit} loading={isSubmitting || create.isPending || update.isPending}>
            {isEdit ? 'Save changes' : 'Create connection'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" error={errors.name?.message} required>
            <Input
              id="name"
              placeholder="Production Postgres"
              invalid={!!errors.name}
              {...register('name')}
            />
          </Field>

          <Field label="Database engine" htmlFor="db_type" hint={meta.hint}>
            <Select id="db_type" disabled={isEdit} {...register('db_type')}>
              {SELECTABLE.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {meta.network && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label={meta.accountBased ? 'Account identifier' : 'Host'}
              htmlFor="host"
              error={errors.host?.message}
              className={meta.accountBased ? 'sm:col-span-3' : 'sm:col-span-2'}
              hint={
                meta.accountBased
                  ? 'Organisation and account name, without the .snowflakecomputing.com suffix.'
                  : undefined
              }
              required={meta.accountBased}
            >
              <Input
                id="host"
                placeholder={
                  meta.accountBased ? 'myorg-acct123' : 'db.example.com'
                }
                invalid={!!errors.host}
                {...register('host')}
              />
            </Field>
            {/* Snowflake is HTTPS-only on 443, so no port field. */}
            {!meta.accountBased && (
              <Field label="Port" htmlFor="port" error={errors.port?.message}>
                <Input
                  id="port"
                  inputMode="numeric"
                  placeholder={meta.defaultPort ? String(meta.defaultPort) : '—'}
                  invalid={!!errors.port}
                  {...register('port')}
                />
              </Field>
            )}
          </div>
        )}

        <Field
          label={meta.network ? 'Database' : 'Database file path'}
          htmlFor="database_name"
          error={errors.database_name?.message}
          hint={
            meta.network
              ? undefined
              : "SQLite file path relative to the server's configured SQLite directory (absolute paths are rejected)."
          }
          required
        >
          <Input
            id="database_name"
            placeholder={
              meta.accountBased
                ? 'RAW_DATA'
                : meta.network
                  ? 'app_production'
                  : 'app.db'
            }
            invalid={!!errors.database_name}
            {...register('database_name')}
          />
        </Field>

        {/* Snowflake addresses tables as database.schema.table and executes
            every query on a named virtual warehouse. */}
        {meta.accountBased && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="Warehouse"
              htmlFor="warehouse"
              error={errors.warehouse?.message}
              hint="Compute that runs the queries."
              required
            >
              <Input
                id="warehouse"
                placeholder="COMPUTE_WH"
                invalid={!!errors.warehouse}
                {...register('warehouse')}
              />
            </Field>
            <Field
              label="Schema"
              htmlFor="sf_schema"
              error={errors.sf_schema?.message}
              hint={`Defaults to ${DEFAULT_SNOWFLAKE_SCHEMA}.`}
            >
              <Input
                id="sf_schema"
                placeholder={DEFAULT_SNOWFLAKE_SCHEMA}
                invalid={!!errors.sf_schema}
                {...register('sf_schema')}
              />
            </Field>
            <Field
              label="Role"
              htmlFor="role"
              error={errors.role?.message}
              hint="Optional — uses your default role."
            >
              <Input
                id="role"
                placeholder="ANALYST_ROLE"
                invalid={!!errors.role}
                {...register('role')}
              />
            </Field>
          </div>
        )}

        {meta.network && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Username"
                htmlFor="username"
                error={errors.username?.message}
                required={meta.accountBased}
              >
                <Input
                  id="username"
                  autoComplete="off"
                  placeholder={meta.accountBased ? 'data_engineer' : 'db_user'}
                  invalid={!!errors.username}
                  {...register('username')}
                />
              </Field>
              <Field
                label="Password"
                htmlFor="password"
                error={errors.password?.message}
                hint={
                  isEdit
                    ? connection?.has_password
                      ? 'Leave blank to keep the current password.'
                      : 'No password stored.'
                    : undefined
                }
              >
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={isEdit && connection?.has_password ? '••••••••' : ''}
                  {...register('password')}
                />
              </Field>
            </div>

            {/* Snowflake always connects over TLS, so there is nothing to choose. */}
            {!meta.accountBased && (
              <Field label="SSL mode" htmlFor="ssl_mode">
                <Select id="ssl_mode" {...register('ssl_mode')}>
                  {SSL_MODES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}

        {/* Account-based engines surface all their extras as real inputs
            above, so the raw JSON editor would have nothing left to hold. */}
        {!meta.accountBased && (
          <details className="rounded-lg border border-line bg-surface-secondary px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-muted transition-colors duration-(--motion-fast) hover:text-ink">
              Advanced parameters (JSON)
            </summary>
            <div className="pt-3">
              <Field
                htmlFor="extra_params"
                error={errors.extra_params?.message}
                hint='e.g. {"uri": "mongodb+srv://…"} or {"sslrootcert": "/path/ca.pem"}'
              >
                <Textarea
                  id="extra_params"
                  rows={3}
                  spellCheck={false}
                  className="font-mono text-xs"
                  placeholder="{}"
                  invalid={!!errors.extra_params}
                  {...register('extra_params')}
                />
              </Field>
            </div>
          </details>
        )}

        {testResult && (
          <Alert
            tone={testResult.ok ? 'success' : 'error'}
            title={testResult.message}
          >
            {testResult.ok && (
              <p className="text-xs opacity-80">
                {testResult.server_version && `Server: ${testResult.server_version}`}
                {testResult.latency_ms != null &&
                  ` · ${testResult.latency_ms.toFixed(0)} ms`}
              </p>
            )}
          </Alert>
        )}
      </form>
    </Modal>
  )
}
