import { createFileRoute, useNavigate } from '@tanstack/react-router'
import Header from '../components/Header'
import { UploadForm } from '../components/forms/UploadForm'
import { useAuth } from '../hooks/useAuth'

export const Route = createFileRoute('/upload')({
  head: () => ({ meta: [{ title: 'Upload Audiobook' }] }),
  component: UploadPage,
})

function UploadPage() {
  const { isLoggedIn, isPending } = useAuth()
  const navigate = useNavigate()

  if (isPending) {
    return (
      <div className="min-w-[360px]">
        <Header title="Upload" backTo="/my-books" />
        <main className="p-6 flex items-center justify-center">
          <span className="animate-pulse opacity-50 text-sm">Loading…</span>
        </main>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="min-w-[360px]">
        <Header title="Upload" backTo="/my-books" />
        <main className="p-6 text-center">
          <p className="text-white/60 mb-4">
            You must be signed in to upload audiobooks.
          </p>
          <button
            onClick={() => navigate({ to: '/sign-in' })}
            className="island-shell rounded-full px-6 py-3"
          >
            Sign In
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="min-w-[360px] pb-20">
      <Header title="Upload Audiobook" backTo="/my-books" />
      <main className="max-w-2xl mx-auto px-4 pt-8">
        <div className="mb-8">
          <h1 className="display-title text-3xl font-bold mb-2">
            New Audiobook
          </h1>
          <p className="text-white/50 text-sm">
            Upload a PDF or TXT file, or paste text directly. Your book will be
            private by default — you can make it public after reviewing it.
          </p>
        </div>
        <UploadForm />
      </main>
    </div>
  )
}
