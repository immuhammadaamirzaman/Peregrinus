import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Plug, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { connectionsApi } from '@/api/connections'
import {
  useCreateConnection,
  useUpdateConnection,
} from '@/hooks/useConnections'
import { DB_TYPES, SSL_MODES, dbMeta } from '@/constants/db'
import { getApiErrorMessage } from '@/lib/api'
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

const schema = z
  .object({
    name: z.string().min(1, 'Name is required').max(120),
    db_type: z.enum(['postgres', 'mysql', 'mongodb', 'sqlite']),
    host: z.string().max(255).optional(),
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

function buildConnFields(v: FormValues) {
  const meta = dbMeta(v.db_type)
  const params = safeJson(v.extra_params) ?? {}
  return {
    db_type: v.db_type as DBType,
    host: meta.network ? v.host || null : null,
    port: meta.network && v.port ? Number(v.port) : null,
    database_name: v.database_name,
    username: meta.network ? v.username || null : null,
    ssl_mode: v.ssl_mode as SSLMode,
    extra_params: params,
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
    },
  })

  // (Re)seed the form whenever the modal opens or the target changes.
  useEffect(() => {
    if (!open) return
    setTestResult(null)
    if (connection) {
      reset({
        name: connection.name,
        db_type: connection.db_type as FormValues['db_type'],
        host: connection.host ?? '',
        port: connection.port ? String(connection.port) : '',
        database_name: connection.database_name,
        username: connection.username ?? '',
        password: '',
        ssl_mode: connection.ssl_mode,
        extra_params:
          connection.extra_params && Object.keys(connection.extra_params).length
            ? JSON.stringify(connection.extra_params, null, 2)
            : '',
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
    // Light client check before hitting the network.
    if (!values.database_name) {
      toast.error('Enter a database name before testing.')
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
          port: meta.network && values.port ? Number(values.port) : null,
          database_name: values.database_name,
          username: meta.network ? values.username || null : null,
          ssl_mode: values.ssl_mode as SSLMode,
          extra_params: safeJson(values.extra_params) ?? {},
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
              label="Host"
              htmlFor="host"
              error={errors.host?.message}
              className="sm:col-span-2"
            >
              <Input
                id="host"
                placeholder="db.example.com"
                invalid={!!errors.host}
                {...register('host')}
              />
            </Field>
            <Field label="Port" htmlFor="port" error={errors.port?.message}>
              <Input
                id="port"
                inputMode="numeric"
                placeholder={meta.defaultPort ? String(meta.defaultPort) : '—'}
                invalid={!!errors.port}
                {...register('port')}
              />
            </Field>
          </div>
        )}

        <Field
          label={meta.network ? 'Database' : 'Database file path'}
          htmlFor="database_name"
          error={errors.database_name?.message}
          hint={
            meta.network
              ? undefined
              : 'Absolute path to the SQLite file on the API server.'
          }
          required
        >
          <Input
            id="database_name"
            placeholder={meta.network ? 'app_production' : '/data/app.db'}
            invalid={!!errors.database_name}
            {...register('database_name')}
          />
        </Field>

        {meta.network && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Username" htmlFor="username" error={errors.username?.message}>
                <Input
                  id="username"
                  autoComplete="off"
                  placeholder="db_user"
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

            <Field label="SSL mode" htmlFor="ssl_mode">
              <Select id="ssl_mode" {...register('ssl_mode')}>
                {SSL_MODES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        <details className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">
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

        {testResult && (
          <div
            className={
              testResult.ok
                ? 'flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-200'
                : 'flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200'
            }
          >
            {testResult.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div>
              <p className="font-medium">{testResult.message}</p>
              {testResult.ok && (
                <p className="text-xs opacity-80">
                  {testResult.server_version && `Server: ${testResult.server_version}`}
                  {testResult.latency_ms != null &&
                    ` · ${testResult.latency_ms.toFixed(0)} ms`}
                </p>
              )}
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
