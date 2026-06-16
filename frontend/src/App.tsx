import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageLoader } from '@/components/ui/Spinner'

// Route-level code splitting: auth pages ship in their own small bundle so
// unauthenticated users don't download the whole app shell.
const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const RegisterPage = lazy(() =>
  import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
)
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const ConnectionsPage = lazy(() =>
  import('@/pages/connections/ConnectionsPage').then((m) => ({
    default: m.ConnectionsPage,
  })),
)
const MigrationsPage = lazy(() =>
  import('@/pages/migrations/MigrationsPage').then((m) => ({
    default: m.MigrationsPage,
  })),
)
const MigrationCreatePage = lazy(() =>
  import('@/pages/migrations/MigrationCreatePage').then((m) => ({
    default: m.MigrationCreatePage,
  })),
)
const MigrationDetailPage = lazy(() =>
  import('@/pages/migrations/MigrationDetailPage').then((m) => ({
    default: m.MigrationDetailPage,
  })),
)
const UsersPage = lazy(() =>
  import('@/pages/admin/UsersPage').then((m) => ({ default: m.UsersPage })),
)
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)

/** Routes that should not be visible once signed in (login / register). */
function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { status, isAuthenticated } = useAuth()
  if (status === 'loading') return <PageLoader />
  if (isAuthenticated) return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />

        {/* Authenticated app shell */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="connections" element={<ConnectionsPage />} />
            <Route path="migrations" element={<MigrationsPage />} />
            <Route path="migrations/new" element={<MigrationCreatePage />} />
            <Route path="migrations/:id" element={<MigrationDetailPage />} />
          </Route>
        </Route>

        {/* Admin-only */}
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route element={<AppLayout />}>
            <Route path="admin/users" element={<UsersPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default App
