import { NavLink } from 'react-router-dom'
import {
  Database,
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  X,
  Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/cn'
import type { Role } from '@/types/api'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles?: Role[]
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/connections', label: 'Connections', icon: Database },
  { to: '/migrations', label: 'Migrations', icon: ArrowLeftRight },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['admin'] },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { user } = useAuth()
  const items = NAV.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  )

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="animate-fade fixed inset-0 z-30 bg-overlay lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          // `border-r` was missing: the old markup set borderRightColor with no
          // border-width utility, so the sidebar had no visible right edge and
          // ran straight into the content area.
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface text-ink',
          'transition-transform duration-(--motion-slow) ease-out-soft lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between gap-2 border-b border-line px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-brand-fg">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-ink">DataMovers</p>
              <p className="text-[11px] text-faint">Database migration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="dm-btn dm-btn-ghost rounded-md p-1 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'dm-nav-item group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                  'outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'dm-nav-item-idle text-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active indicator rail. Grows in on hover as an affordance. */}
                  <span
                    className={cn(
                      'absolute left-0 top-1/2 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-600',
                      'transition-all duration-(--motion-base) ease-out-soft',
                      isActive
                        ? 'h-5 opacity-100'
                        : 'h-0 opacity-0 group-hover:h-4 group-hover:opacity-60',
                    )}
                    aria-hidden
                  />

                  <span
                    className={cn(
                      'flex items-center justify-center transition-transform duration-(--motion-base) ease-out-soft',
                      isActive ? 'text-brand-600' : 'group-hover:translate-x-0.5',
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>

                  <span className="transition-transform duration-(--motion-base) ease-out-soft group-hover:translate-x-0.5">
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-line p-4">
          <p className="text-[11px] text-faint">Phase 1 · Full-dump copy</p>
        </div>
      </aside>
    </>
  )
}
