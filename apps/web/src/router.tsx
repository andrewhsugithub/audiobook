import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'

// Single shared instances for the whole app. `main.tsx` wires these into the
// providers; the router exposes `queryClient` on its context so route loaders
// can prefetch.
export const queryClient = new QueryClient()

export const router = createTanStackRouter({
  routeTree,
  scrollRestoration: true,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  context: { queryClient },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
