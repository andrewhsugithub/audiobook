import type { ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAuth } from '../hooks/useAuth'

interface Props {
  children: ReactNode
  /** Where to redirect unauthenticated users (default: /sign-in) */
  fallback?: string
}

/**
 * Wrap any route content that requires an authenticated user.
 * Shows a loading state during session hydration, then redirects
 * if no session exists.
 */
export function AuthGuard({ children, fallback = '/sign-in' }: Props) {
  const { isLoggedIn, isPending } = useAuth()

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <span className="animate-pulse opacity-60 text-sm">
          Checking session…
        </span>
      </div>
    )
  }

  if (!isLoggedIn) {
    return <Navigate to={fallback} />
  }

  return <>{children}</>
}
