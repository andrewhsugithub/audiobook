import { useNavigate } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { signUp } from '../../lib/auth'
import { useToast } from '../Toast'

const signUpSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    email: z.email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export function SignUpForm() {
  const navigate = useNavigate()
  const toast = useToast()

  const form = useForm({
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
    validators: { onSubmit: signUpSchema },
    onSubmit: async ({ value }) => {
      await signUp.email(
        {
          name: value.name,
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            toast.success("Account created! You're signed in.")
            navigate({ to: '/' })
          },
          onError: (ctx) => {
            toast.error(ctx.error.message ?? 'Registration failed.')
          },
        },
      )
    },
  })

  return (
    <div className="max-w-sm mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Create Account</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="space-y-4"
      >
        <form.Field
          name="name"
          children={(field) => (
            <div className="space-y-1">
              <label htmlFor={field.name} className="field-label">
                Name
              </label>
              <input
                id={field.name}
                type="text"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className="field-input"
                placeholder="Your name"
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

        <form.Field
          name="confirmPassword"
          children={(field) => (
            <div className="space-y-1">
              <label htmlFor={field.name} className="field-label">
                Confirm Password
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
              {isSubmitting ? 'Creating account…' : 'Sign Up'}
            </button>
          )}
        />
      </form>
    </div>
  )
}
