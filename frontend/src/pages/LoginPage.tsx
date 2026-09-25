import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useAuth } from '@/auth/AuthContext'
import { getApiErrorMessage } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { AuthShell } from '@/pages/auth/AuthShell'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type FormValues = z.infer<typeof schema>

interface LocationState {
  from?: { pathname?: string }
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values.email, values.password)
      const from = (location.state as LocationState | null)?.from?.pathname
      navigate(from && from !== '/login' ? from : '/', { replace: true })
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Could not sign in.'))
    }
  })

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your DataMovers account"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link
            to="/register"
            className="font-medium text-brand-600 transition-colors duration-(--motion-fast) hover:text-brand-700"
          >
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}

        <Field label="Email" htmlFor="email" error={errors.email?.message} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            invalid={!!errors.email}
            {...register('email')}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
          required
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            invalid={!!errors.password}
            {...register('password')}
          />
        </Field>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}
