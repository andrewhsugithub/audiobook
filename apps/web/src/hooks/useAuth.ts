import { type User, useSession } from '../lib/auth'

/**
 * Convenience hook that wraps better-auth's useSession and provides
 * derived booleans the UI needs everywhere (isLoggedIn, isAdmin, userId).
 */
export function useAuth() {
  const { data: session, isPending, error, refetch } = useSession()

  const user: User | null = session?.user ?? null

  return {
    session,
    user,
    userId: user?.id ?? null,
    isLoggedIn: !!user,
    isPending,
    error,
    refetch,
  }
}
