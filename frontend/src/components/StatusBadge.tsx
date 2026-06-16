import { Badge } from '@/components/ui/Badge'
import {
  MIGRATION_STATUS_TONE,
  TABLE_STATUS_TONE,
  USER_STATUS_TONE,
} from '@/constants/db'
import type { MigrationStatus, TableStatus, UserStatus } from '@/types/api'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function MigrationStatusBadge({ status }: { status: MigrationStatus }) {
  const tone = MIGRATION_STATUS_TONE[status]
  return (
    <Badge tone={tone} dot>
      {cap(status)}
    </Badge>
  )
}

export function TableStatusBadge({ status }: { status: TableStatus }) {
  return <Badge tone={TABLE_STATUS_TONE[status]}>{cap(status)}</Badge>
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return <Badge tone={USER_STATUS_TONE[status]}>{cap(status)}</Badge>
}
