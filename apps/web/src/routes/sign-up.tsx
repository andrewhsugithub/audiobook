import { createFileRoute, Link } from '@tanstack/react-router'
import { SignUpForm } from '../components/forms/SignUpForm'

export const Route = createFileRoute('/sign-up')({
  head: () => ({ meta: [{ title: 'Sign Up · Audiobook' }] }),
  component: SignUpPage,
})

function SignUpPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center h-screen">
      <SignUpForm />
      <p className="mt-4 text-sm opacity-60">
        Already have an account?{' '}
        <Link to="/sign-in" className="underline hover:opacity-100">
          Sign in
        </Link>
      </p>
    </div>
  )
}
