import {
  HeadContent,
  Link,
  Outlet,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import '../styles.css'
import type { QueryClient } from '@tanstack/react-query'
import { ToastProvider } from '../components/Toast'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      { title: 'Audiobook' },
      {
        name: 'description',
        content:
          'Turn text and PDFs into multi-voice audiobooks you can stream.',
      },
    ],
  }),
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundComponent,
})

function CenteredMessage({
  kicker,
  title,
  children,
}: {
  kicker: string
  title: string
  children?: React.ReactNode
}) {
  return (
    <main className="page-wrap flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="island-kicker mb-2">{kicker}</p>
      <h1 className="display-title mb-4 text-4xl font-bold">{title}</h1>
      {children}
      <Link to="/" className="island-shell mt-6 rounded-full px-5 py-3">
        Back to Home
      </Link>
    </main>
  )
}

function RootErrorComponent({ error }: ErrorComponentProps) {
  return (
    <CenteredMessage kicker="Something went wrong" title="Unexpected error">
      <p className="max-w-md text-sm opacity-70">
        {error instanceof Error ? error.message : 'Please try again.'}
      </p>
    </CenteredMessage>
  )
}

function NotFoundComponent() {
  return (
    <CenteredMessage kicker="404" title="Page not found">
      <p className="max-w-md text-sm opacity-70">
        The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
      </p>
    </CenteredMessage>
  )
}

function RootComponent() {
  return (
    <ToastProvider>
      <HeadContent />
      <Outlet />
      <TanStackDevtools
        config={{
          position: 'bottom-right',
        }}
        plugins={[
          {
            name: 'TanStack Router',
            render: <TanStackRouterDevtoolsPanel />,
          },
          {
            name: 'React Query',
            render: <ReactQueryDevtools initialIsOpen={false} />,
          },
        ]}
      />
    </ToastProvider>
  )
}
