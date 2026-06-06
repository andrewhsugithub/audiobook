import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { FaArrowLeft, FaHome } from 'react-icons/fa'
import { SignInForm } from '../components/forms/SignInForm'
import ThemeToggle from '../components/ThemeToggle'

export const Route = createFileRoute('/sign-in')({
  head: () => ({ meta: [{ title: 'Sign In · Audiobook' }] }),
  component: SignInPage,
})

function SignInPage() {
  const router = useRouter()

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-16">
      {/* Top bar: back + theme */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <div className="relative z-10 flex items-center gap-2">
          {/* Back */}
          <button
            onClick={() => router.history.back()}
            aria-label="Go back"
            className="btn btn-ghost btn-circle btn-sm"
          >
            <FaArrowLeft aria-hidden="true" />
          </button>

          <Link
            to="/"
            aria-label="Go to home library dashboard"
            className="btn btn-ghost btn-circle btn-sm flex items-center justify-center text-base"
          >
            <FaHome aria-hidden="true" />
          </Link>
        </div>
        <ThemeToggle />
      </div>

      {/* Brand */}
      <Link
        to="/"
        className="display-title mb-8 text-2xl font-bold tracking-tight text-[var(--sea-ink)] no-underline"
      >
        📚 Audiobook
      </Link>

      <SignInForm />

      <p className="mt-6 text-sm text-[var(--sea-ink-soft)]">
        Don&apos;t have an account?{' '}
        <Link
          to="/sign-up"
          className="font-semibold text-[var(--lagoon-deep)] hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  )
}
