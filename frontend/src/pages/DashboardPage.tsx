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
import { Reveal, Stagger } from '@/components/ui/Motion'
import { PageLoader } from '@/components/ui/Spinner'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * Stat tones are semantic keys rather than the raw Tailwind palette strings the
 * page used to pass in (`bg-blue-50 text-blue-600`, `bg-emerald-50 …`). Those
 * were fixed light-mode tints that stayed pale on every dark theme.
 */
type StatTone = 'brand' | 'info' | 'success' | 'error'

const STAT_TONES: Record<StatTone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  error: 'bg-error-soft text-error',
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: number
  tone: StatTone
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
            STAT_TONES[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold text-ink">{value}</p>
          <p className="truncate text-sm text-muted">{label}</p>
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
  const running = migs.filter(
    (m) => m.status === 'running' || m.status === 'pending',
  ).length
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

      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Database}
          label="Connections"
          value={connections.data?.length ?? 0}
          tone="brand"
        />
        <StatCard icon={Loader2} label="Active" value={running} tone="info" />
        <StatCard
          icon={CheckCircle2}
          label="Completed"
          value={completed}
          tone="success"
        />
        <StatCard icon={XCircle} label="Failed" value={failed} tone="error" />
      </Stagger>

      <Reveal className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Recent migrations</h2>
          <Link
            to="/migrations"
            className="rounded text-sm font-medium text-brand-600 transition-colors duration-(--motion-fast) hover:text-brand-700"
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
                  <p className="text-sm text-muted">
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
          <Card className="divide-y divide-line overflow-hidden">
            {recent.map((m) => (
              // `.dm-row` replaces the onMouseEnter/onMouseLeave pair that wrote
              // inline background styles on every pointer move.
              <Link
                key={m.id}
                to={`/migrations/${m.id}`}
                className="dm-row flex items-center justify-between gap-4 px-5 py-3.5 text-ink"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                  <p className="text-xs text-faint">
                    Updated {formatRelative(m.updated_at)}
                  </p>
                </div>
                <MigrationStatusBadge status={m.status} />
              </Link>
            ))}
          </Card>
        )}
      </Reveal>
    </>
  )
}
