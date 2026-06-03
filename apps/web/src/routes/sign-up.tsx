import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { FaArrowLeft } from 'react-icons/fa'
import { SignUpForm } from '../components/forms/SignUpForm'
import ThemeToggle from '../components/ThemeToggle'

export const Route = createFileRoute('/sign-up')({
  head: () => ({ meta: [{ title: 'Sign Up · Audiobook' }] }),
  component: SignUpPage,
})

function SignUpPage() {
  const router = useRouter()

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-16">
      {/* Top bar: back + theme */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <button
          type="button"
          onClick={() => router.history.back()}
          className="btn btn-soft btn-sm gap-2"
          aria-label="Go back"
        >
          <FaArrowLeft aria-hidden="true" />
          Back
        </button>
        <ThemeToggle />
      </div>

      {/* Brand */}
      <Link
        to="/"
        className="display-title mb-8 text-2xl font-bold tracking-tight text-[var(--sea-ink)] no-underline"
      >
        📚 Audiobook
      </Link>

      <SignUpForm />

      <p className="mt-6 text-sm text-[var(--sea-ink-soft)]">
        Already have an account?{' '}
        <Link
          to="/sign-in"
          className="font-semibold text-[var(--lagoon-deep)] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
