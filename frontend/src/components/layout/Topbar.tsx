import { useEffect, useRef, useState } from 'react'
import { Menu, LogOut, ChevronDown, UserCircle2, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  user: 'User',
  guest: 'Guest',
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const initials = (user?.full_name || user?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')

  return (
    // `bg-surface/90` rather than the old `opacity: 0.95`: that opacity applied
    // to the whole header including its text and avatar, washing out the
    // content instead of just letting the background blur through.
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
      <button
        onClick={onMenu}
        className="dm-btn dm-btn-ghost rounded-md p-2 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      <div className="relative" ref={ref}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="dm-btn dm-btn-ghost flex items-center gap-2.5 rounded-lg py-1.5 pl-1.5 pr-2.5 text-ink"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {initials || <UserCircle2 className="h-5 w-5" />}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block max-w-[160px] truncate text-sm font-medium text-ink">
              {user?.full_name || user?.email}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-faint transition-transform duration-(--motion-base) ease-out-soft',
              menuOpen && 'rotate-180',
            )}
            aria-hidden
          />
        </button>

        {menuOpen && (
          <div
            className="animate-slide-l absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-raised"
            role="menu"
          >
            <div className="border-b border-line px-4 py-3">
              <p className="truncate text-sm font-medium text-ink">
                {user?.full_name || 'Account'}
              </p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
              {user && (
                <div className="mt-2">
                  <Badge tone={user.role === 'admin' ? 'info' : 'neutral'}>
                    {ROLE_LABEL[user.role] ?? user.role}
                  </Badge>
                </div>
              )}
            </div>
            <Link
              to="/settings"
              onClick={() => setMenuOpen(false)}
              className="dm-row flex items-center gap-2 px-4 py-2.5 text-left text-sm text-ink"
              role="menuitem"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <button
              onClick={() => {
                setMenuOpen(false)
                logout()
              }}
              className="dm-btn dm-btn-ghost-danger flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm"
              role="menuitem"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
