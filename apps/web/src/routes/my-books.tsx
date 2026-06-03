import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import Header from '../components/Header'
import { useLibrary } from '../hooks/useLibrary'
import { useAuth } from '../hooks/useAuth'
import BookCard from '../components/BookCard'
import UploadBookButton from '../components/UploadBookButton'

export const Route = createFileRoute('/my-books')({
  head: () => ({ meta: [{ title: 'My Books · Audiobook' }] }),
  component: MyBooksPage,
})

function MyBooksPage() {
  const { isLoggedIn, isPending } = useAuth()
  const { data, isLoading } = useLibrary(isLoggedIn)
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all')

  const books = data?.results ?? []

  const filtered = books.filter((b) => {
    if (filter === 'all') return true
    return b.visibility === filter
  })

  if (!isPending && !isLoggedIn) {
    return (
      <div className="min-w-[360px] h-screen">
        <Header title="My Books" backTo="/" />
        <main className="p-6 text-center">
          <p className="text-white/60 mb-4">Sign in to see your saved books.</p>
          <Link
            to="/sign-in"
            className="island-shell rounded-full px-6 py-3 inline-block"
          >
            Sign In
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-w-[360px] pb-20">
      <Header
        title="My Books"
        backTo="/"
        right={
          <Link
            to="/upload"
            className="island-shell rounded-full px-4 py-2 text-sm font-medium"
          >
            + Upload
          </Link>
        }
      />

      <main className="p-4 max-w-5xl mx-auto h-full">
        {/* Filter pills */}
        {books.length > 0 && (
          <div className="flex gap-2 mb-6">
            {(['all', 'public', 'private'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`
                  px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-colors
                  ${
                    filter === f
                      ? 'bg-white text-black'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }
                `}
              >
                {f === 'public'
                  ? '🌐 Public'
                  : f === 'private'
                    ? '🔒 Private'
                    : 'All'}
                {f !== 'all' && (
                  <span className="ml-1 opacity-60">
                    ({books.filter((b) => b.visibility === f).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <ul
            className="grid gap-8 justify-start"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 280px))',
            }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="animate-pulse">
                <div className="aspect-[2/3] bg-white/5 rounded" />
                <div className="mt-2 h-4 bg-white/5 rounded w-3/4" />
              </li>
            ))}
          </ul>
        ) : (
          <ul
            className="grid gap-8 justify-start"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 280px))',
            }}
          >
            <UploadBookButton />

            {filtered.length === 0 && !isLoading && (
              <li className="col-span-full text-sm text-white/40 py-8">
                {filter === 'all'
                  ? 'No saved books yet. Browse the library or upload your own!'
                  : `No ${filter} books.`}
              </li>
            )}

            {filtered.map((book) => (
              <li key={book.id} className="relative">
                {/* Visibility badge */}
                <div className="absolute top-2 left-2 z-10">
                  <span
                    className={`
                      text-[10px] font-bold px-1.5 py-0.5 rounded
                      ${
                        book.visibility === 'public'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-white/10 text-white/40 border border-white/20'
                      }
                    `}
                  >
                    {book.visibility === 'public' ? '🌐' : '🔒'}
                  </span>
                </div>
                <BookCard bookId={book.id} libraryTitle="My Books" />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
