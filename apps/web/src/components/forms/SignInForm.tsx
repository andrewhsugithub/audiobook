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
    <div className="max-w-sm mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Sign In</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="space-y-4"
      >
        <form.Field
          name="email"
          children={(field) => (
            <div className="space-y-1">
              <label htmlFor={field.name} className="field-label">
                Email
              </label>
              <input
                id={field.name}
                type="email"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className="field-input"
                placeholder="you@example.com"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-red-400">
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
            <div className="space-y-1">
              <label htmlFor={field.name} className="field-label">
                Password
              </label>
              <input
                id={field.name}
                type="password"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className="field-input"
                placeholder="••••••••"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-red-400">
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
              className="btn-primary w-full py-3 island-shell"
            >
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </button>
          )}
        />
      </form>
    </div>
  )
}
