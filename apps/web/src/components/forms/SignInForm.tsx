import { useNavigate } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { signIn } from '../../lib/auth'
import { useToast } from '../Toast'
import { useQueryClient } from '@tanstack/react-query'

const signInSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export function SignInForm() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()

  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: signInSchema },
    onSubmit: async ({ value }) => {
      await signIn.email(
        { email: value.email, password: value.password },
        {
          onSuccess: () => {
            queryClient.clear() // Clear cached data to reset auth state and trigger refetches for protected queries
            toast.success('Signed in successfully.')
            navigate({ to: '/' })
          },
          onError: (ctx) => {
            toast.error(ctx.error.message ?? 'Sign-in failed.')
          },
        },
      )
    },
  })

  return (
    <div className="auth-card w-full max-w-md rounded-3xl p-8 sm:p-10">
      <p className="island-kicker mb-2">Welcome back</p>
      <h2 className="display-title text-3xl font-bold sm:text-4xl">Sign in</h2>
      <p className="mt-2 mb-8 text-sm text-[var(--sea-ink-soft)]">
        Pick up right where you left off in your library.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="space-y-5"
      >
        <form.Field
          name="email"
          children={(field) => (
            <div className="space-y-1.5">
              <label htmlFor={field.name} className="field-label">
                Email
              </label>
              <input
                id={field.name}
                type="email"
                autoComplete="email"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className="field-input field-input-lg"
                placeholder="you@example.com"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-error">
                  {field.state.meta.errors
                    .map((err: any) => err?.message ?? err)
                    .join(', ')}
                </p>
              )}
            </div>
          )}
        />

        <form.Field
          name="password"
          children={(field) => (
            <div className="space-y-1.5">
              <label htmlFor={field.name} className="field-label">
                Password
              </label>
              <input
                id={field.name}
                type="password"
                autoComplete="current-password"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className="field-input field-input-lg"
                placeholder="••••••••"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-error">
                  {field.state.meta.errors
                    .map((err: any) => err?.message ?? err)
                    .join(', ')}
                </p>
              )}
            </div>
          )}
        />

        <form.Subscribe
          selector={(s) => [s.canSubmit, s.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn btn-primary btn-lg btn-block mt-2"
            >
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </button>
          )}
        />
      </form>
    </div>
  )
}
