import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {/*
            Keying on pathname remounts this wrapper on navigation, which
            restarts the entrance animation — a route transition for the cost of
            one CSS animation. The key is on a plain div rather than the Outlet
            so route components themselves aren't forced to remount beyond what
            the router already does.
          */}
          <div key={pathname} className="animate-rise">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
