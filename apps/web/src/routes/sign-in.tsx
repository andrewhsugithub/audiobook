import { createFileRoute, Link } from '@tanstack/react-router'
import { SignInForm } from '../components/forms/SignInForm'

export const Route = createFileRoute('/sign-in')({
  head: () => ({ meta: [{ title: 'Sign In · Audiobook' }] }),
  component: SignInPage,
})

function SignInPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center h-screen">
      <SignInForm />
      <p className="mt-4 text-sm opacity-60">
        Don't have an account?{' '}
        <Link to="/sign-up" className="underline hover:opacity-100">
          Sign up
        </Link>
      </p>
    </div>
  )
}
