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
    <div className="auth-card w-full max-w-md rounded-3xl p-8 sm:p-10">
      <p className="island-kicker mb-2">Get started</p>
      <h2 className="display-title text-3xl font-bold sm:text-4xl">
        Create your account
      </h2>
      <p className="mt-2 mb-8 text-sm text-[var(--sea-ink-soft)]">
        Upload books and build your personal audio library.
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
          name="name"
          children={(field) => (
            <div className="space-y-1.5">
              <label htmlFor={field.name} className="field-label">
                Name
              </label>
              <input
                id={field.name}
                type="text"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className="field-input field-input-lg"
                placeholder="Your name"
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
          name="email"
          children={(field) => (
            <div className="space-y-1.5">
              <label htmlFor={field.name} className="field-label">
                Email
              </label>
              <input
                id={field.name}
                type="email"
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

        <form.Field
          name="confirmPassword"
          children={(field) => (
            <div className="space-y-1.5">
              <label htmlFor={field.name} className="field-label">
                Confirm Password
              </label>
              <input
                id={field.name}
                type="password"
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
              {isSubmitting ? 'Creating account…' : 'Sign Up'}
            </button>
          )}
        />
      </form>
    </div>
  )
}
