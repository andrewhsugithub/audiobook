import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import Header from '../components/Header'
import BookCard from '../components/BookCard'
import UploadBookButton from '../components/UploadBookButton'
import SearchBar from '../components/SearchBar'
import SortSelect from '../components/SortSelect'
import Pagination from '../components/Pagination'
import { useAuth } from '../hooks/useAuth'
import type { SortKey } from '../utils/queries'
import { useLibrarySearch } from '../hooks/useLibrary'

export const Route = createFileRoute('/my-books')({
  head: () => ({ meta: [{ title: 'My Books · Audiobook' }] }),
  component: MyBooksPage,
})

type VisibilityFilter = 'all' | 'public' | 'private'
type OwnerFilter = 'saved' | 'uploaded'

const VISIBILITY_FILTERS: { key: VisibilityFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'public', label: '🌐 Public' },
  { key: 'private', label: '🔒 Private' },
]

const OWNER_FILTERS: { key: OwnerFilter; label: string }[] = [
  { key: 'saved', label: '📚 Saved' },
  { key: 'uploaded', label: '⬆️ Uploaded by me' },
]

const PAGE_SIZE_OPTIONS = [10, 20, 50]
const DEFAULT_PAGE_SIZE = 10
const MAX_CARD = 220
const GAP = 32

function MyBooksPage() {
  const { isLoggedIn, isPending } = useAuth()

  const [searchInput, setSearchInput] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [visibilityFilter, setVisibilityFilter] =
    useState<VisibilityFilter>('all')
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('saved')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [searchInput, sort, visibilityFilter, ownerFilter, pageSize])

  const offset = (page - 1) * pageSize

  // FIXED: Use unified server-side paginated hook for both tabs
  const {
    data: libraryData,
    isLoading,
    isFetching,
    isStale,
  } = useLibrarySearch({
    q: searchInput,
    limit: pageSize,
    offset,
    sort,
    visibility: visibilityFilter,
    scope: ownerFilter,
    enabled: !!isLoggedIn,
  })

  const books = libraryData?.results ?? []
  const total = libraryData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    if (!isLoading && page > totalPages) setPage(totalPages)
  }, [isLoading, page, totalPages])

  const isEmpty = !isLoading && books.length === 0

  const gridRef = useRef<HTMLUListElement>(null)
  const [isMultiRow, setIsMultiRow] = useState(false)

  useEffect(() => {
    const update = () => {
      const container = gridRef.current
      if (!container) return
      const width = container.clientWidth
      const totalWidth =
        books.length * MAX_CARD + Math.max(0, books.length - 1) * GAP
      setIsMultiRow(totalWidth > width)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [books.length])

  const rangeStart = total === 0 ? 0 : offset + 1
  const rangeEnd = Math.min(offset + books.length, total)

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
          <div className="flex items-center gap-3">
            <SearchBar value={searchInput} onChange={setSearchInput} />
            <Link to="/upload" className="btn btn-sm btn-primary shrink-0">
              + Upload
            </Link>
          </div>
        }
      />

      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="mb-4 flex gap-4 border-b border-[var(--chip-line)]">
          {OWNER_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setOwnerFilter(key)}
              className={[
                'pb-2 px-2 text-sm font-semibold border-b-2 transition-colors relative top-[1px]',
                ownerFilter === key
                  ? 'border-[var(--lagoon)] text-[var(--lagoon)]'
                  : 'border-transparent text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="min-h-5 text-sm text-[var(--sea-ink-soft)]">
            {isLoading ? (
              <span className="animate-pulse">Loading…</span>
            ) : isEmpty ? null : (
              <>
                <span className="font-semibold text-[var(--sea-ink)]">
                  {rangeStart}–{rangeEnd}
                </span>{' '}
                of {total} {total === 1 ? 'book' : 'books'}
                {searchInput && <> for &ldquo;{searchInput}&rdquo;</>}
                {isStale && <span className="ml-2 opacity-50">updating…</span>}
              </>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {ownerFilter === 'saved' && (
              <div className="flex gap-1.5">
                {VISIBILITY_FILTERS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setVisibilityFilter(key)}
                    className={`btn btn-sm ${visibilityFilter === key ? 'btn-primary' : 'btn-soft'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <SortSelect value={sort} onChange={setSort} />
          </div>
        </div>

        <section>
          <ul
            ref={gridRef}
            className="grid gap-8 justify-start animate-fade-in"
            style={{
              gridTemplateColumns: isMultiRow
                ? 'repeat(auto-fit, minmax(220px, 1fr))'
                : 'repeat(auto-fit, minmax(220px, 280px))',
            }}
          >
            {ownerFilter === 'uploaded' && <UploadBookButton />}

            {isLoading
              ? Array.from({ length: pageSize }).map((_, i) => (
                  <li key={i} className="w-[220px] sm:w-auto">
                    <div className="aspect-[2/3] w-full rounded bg-[var(--line)] animate-pulse" />
                    <div className="mt-2 h-4 w-3/4 rounded bg-[var(--line)] animate-pulse" />
                    <div className="mt-1 h-3 w-1/2 rounded bg-[var(--line)] animate-pulse" />
                  </li>
                ))
              : books.map((book) => (
                  <li key={book.id} className="relative group">
                    <div className="pointer-events-none absolute left-2 top-2 z-10 transition-transform group-hover:scale-105">
                      <span
                        className={
                          book.visibility === 'public'
                            ? 'rounded-full bg-[var(--palm)]/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm shadow-sm'
                            : 'rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur-sm shadow-sm'
                        }
                      >
                        {book.visibility === 'public'
                          ? '🌐 Public'
                          : '🔒 Private'}
                      </span>
                    </div>
                    <BookCard bookId={book.id} libraryTitle="My Books" />
                  </li>
                ))}
          </ul>

          {isEmpty && (
            <div className="py-20 px-10 text-center text-sm text-[var(--sea-ink-soft)] bg-[var(--chip-bg)]/30 rounded-2xl border border-dashed border-[var(--chip-line)] max-w-lg mx-auto mt-6">
              <p className="text-2xl mb-2">📭</p>
              <p>
                {searchInput
                  ? `No search results matches your query for "${searchInput}".`
                  : ownerFilter === 'uploaded'
                    ? "You haven't uploaded any personal configurations yet."
                    : visibilityFilter !== 'all'
                      ? `No explicit ${visibilityFilter} book entries found inside your profile shelf.`
                      : 'Your library is empty. Discover public tracks or append standard configurations to get started!'}
              </p>
            </div>
          )}

          {!isEmpty && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              disabled={isFetching}
            />
          )}
        </section>
      </main>
    </div>
  )
}
