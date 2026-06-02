import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_BASE_URL || 'http://localhost:8787',
  plugins: [adminClient()],
  fetchOptions: {
    auth: {
      type: 'Bearer',
      token: () => localStorage.getItem('bearer_token') || '', // get the token from localStorage
    },
  },
})

export const { useSession, signIn, signUp, signOut } = authClient

// Inferred session types for use across the app
export type Session = typeof authClient.$Infer.Session
export type User = typeof authClient.$Infer.Session.user
