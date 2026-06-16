import { useEffect, useRef, useState } from 'react'
import { Menu, LogOut, ChevronDown, UserCircle2 } from 'lucide-react'

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
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const initials = (user?.full_name || user?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 backdrop-blur sm:px-6">
      <button
        onClick={onMenu}
        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      <div className="relative" ref={ref}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2.5 rounded-lg py-1.5 pl-1.5 pr-2.5 hover:bg-slate-100"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {initials || <UserCircle2 className="h-5 w-5" />}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block max-w-[160px] truncate text-sm font-medium text-slate-800">
              {user?.full_name || user?.email}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="truncate text-sm font-medium text-slate-900">
                {user?.full_name || 'Account'}
              </p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
              {user && (
                <div className="mt-2">
                  <Badge tone={user.role === 'admin' ? 'info' : 'neutral'}>
                    {ROLE_LABEL[user.role] ?? user.role}
                  </Badge>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setMenuOpen(false)
                logout()
              }}
              className={cn(
                'flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50',
              )}
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
