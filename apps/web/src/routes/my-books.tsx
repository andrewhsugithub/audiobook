import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { FaSearch } from 'react-icons/fa'
import Header from '../components/Header'
import { useLibrary } from '../hooks/useLibrary'
import { useAuth } from '../hooks/useAuth'
import BookCard from '../components/BookCard'
import UploadBookButton from '../components/UploadBookButton'

export const Route = createFileRoute('/my-books')({
  head: () => ({ meta: [{ title: 'My Books · Audiobook' }] }),
  component: MyBooksPage,
})

type Filter = 'all' | 'public' | 'private'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'public', label: '🌐 Public' },
  { key: 'private', label: '🔒 Private' },
]

function MyBooksPage() {
  const { isLoggedIn, isPending } = useAuth()
  const { data, isLoading } = useLibrary(isLoggedIn)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const books = data?.results ?? []

  const counts = useMemo(
    () => ({
      all: books.length,
      public: books.filter((b) => b.visibility === 'public').length,
      private: books.filter((b) => b.visibility === 'private').length,
    }),
    [books],
  )

  const q = query.trim().toLowerCase()
  const filtered = books.filter((b) => {
    if (filter !== 'all' && b.visibility !== filter) return false
    if (!q) return true
    return (
      b.title.toLowerCase().includes(q) ||
      (b.author ?? '').toLowerCase().includes(q)
    )
  })

  if (!isPending && !isLoggedIn) {
    return (
      <div className="min-w-[360px]">
        <Header title="My Books" backTo="/" />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <div className="island-shell rounded-2xl px-8 py-10">
            <p className="text-4xl">📚</p>
            <h2 className="display-title mt-4 text-xl font-bold text-[var(--sea-ink)]">
              Your shelf awaits
            </h2>
            <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
              Sign in to see the books you&apos;ve saved and uploaded.
            </p>
            <Link to="/sign-in" className="btn btn-primary mt-6">
              Sign In
            </Link>
          </div>
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
          <Link to="/upload" className="btn btn-sm btn-primary">
            + Upload
          </Link>
        }
      />

      <main className="mx-auto h-full max-w-6xl p-4 sm:p-6">
        {/* Toolbar: search + visibility filters */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-xs">
            <FaSearch
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm opacity-50"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your books…"
              aria-label="Search your books"
              autoComplete="off"
              className="h-11 w-full rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] pr-4 pl-11 text-sm text-[var(--sea-ink)] outline-none transition-all duration-300 placeholder:text-[var(--sea-ink-soft)]/60 focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[var(--lagoon)]/20"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map(({ key, label }) => {
              const active = filter === key
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`btn btn-sm ${active ? 'btn-primary' : 'btn-soft'}`}
                >
                  {label}
                  <span className="ml-1.5 opacity-70">{counts[key]}</span>
                </button>
              )
            })}
          </div>
        </div>

        {isLoading ? (
          <ul
            className="grid gap-8 justify-start"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 280px))',
            }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="animate-pulse">
                <div className="aspect-[2/3] bg-[var(--line)] rounded" />
                <div className="mt-2 h-4 bg-[var(--line)] rounded w-3/4" />
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

            {filtered.length === 0 && (
              <li className="col-span-full py-12 text-center text-sm text-[var(--sea-ink-soft)]">
                {q
                  ? `No books match “${query.trim()}”.`
                  : filter === 'all'
                    ? 'No saved books yet. Browse the library or upload your own!'
                    : `No ${filter} books yet.`}
              </li>
            )}

            {filtered.map((book) => (
              <li key={book.id} className="relative">
                {/* Visibility badge */}
                <div className="pointer-events-none absolute top-2 left-2 z-10">
                  <span
                    className={
                      book.visibility === 'public'
                        ? 'rounded-full bg-[var(--palm)]/85 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm'
                        : 'rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur-sm'
                    }
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
