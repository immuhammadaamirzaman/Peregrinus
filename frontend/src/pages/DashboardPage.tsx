import { Link } from 'react-router-dom'
import {
  Database,
  ArrowLeftRight,
  CheckCircle2,
  Loader2,
  Plus,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useAuth } from '@/auth/AuthContext'
import { useConnections } from '@/hooks/useConnections'
import { useMigrations } from '@/hooks/useMigrations'
import { CanWrite } from '@/components/RoleGate'
import { MigrationStatusBadge } from '@/components/StatusBadge'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/cn'

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: number
  tone: string
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-lg', tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold text-slate-900">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </div>
    </Card>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const connections = useConnections()
  const migrations = useMigrations()

  if (connections.isLoading || migrations.isLoading)
    return <PageLoader label="Loading dashboard…" />

  const migs = migrations.data ?? []
  const running = migs.filter((m) => m.status === 'running' || m.status === 'pending').length
  const completed = migs.filter((m) => m.status === 'completed').length
  const failed = migs.filter((m) => m.status === 'failed').length
  const recent = migs.slice(0, 6)

  return (
    <>
      <PageHeader
        title={`Welcome${user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}`}
        description="Overview of your database connections and migration jobs."
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Database}
          label="Connections"
          value={connections.data?.length ?? 0}
          tone="bg-brand-50 text-brand-600"
        />
        <StatCard
          icon={Loader2}
          label="Active"
          value={running}
          tone="bg-blue-50 text-blue-600"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed"
          value={completed}
          tone="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          icon={XCircle}
          label="Failed"
          value={failed}
          tone="bg-red-50 text-red-600"
        />
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Recent migrations
          </h2>
          <Link
            to="/migrations"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No migrations yet"
            description="Create a connection, then set up your first migration to move data between databases."
            action={
              <CanWrite
                fallback={
                  <p className="text-sm text-slate-500">
                    Ask a teammate with write access to create one.
                  </p>
                }
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
          <Card className="divide-y divide-slate-100">
            {recent.map((m) => (
              <Link
                key={m.id}
                to={`/migrations/${m.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {m.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    Updated {formatRelative(m.updated_at)}
                  </p>
                </div>
                <MigrationStatusBadge status={m.status} />
              </Link>
            ))}
          </Card>
        )}
      </div>
    </>
  )
}
