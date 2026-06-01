import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import BookCard from '../components/BookCard'
import Header from '../components/Header'
import SearchBar from '../components/SearchBar'
import { searchQuery } from '../utils/queries'
import { useSearch } from '../hooks/useSearch'
import { getMyBooks } from '../utils/myBooks'

export const Route = createFileRoute('/library')({
  head: () => ({ meta: [{ title: 'Library · Audiobook' }] }),
  // Prefetch default search (empty = recent books) when route loads
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(searchQuery(''))
  },
  component: Library,
})

const MAX_CARD = 280
const GAP = 24
const PAGE_SIZE = 50

function Library() {
  const { title } = Route.useSearch() as { title?: string }
  const [searchInput, setSearchInput] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const isMyBooks = title === 'My Books'

  const myBooks = isMyBooks ? getMyBooks() : []

  // Reset paging whenever the query changes so each new search starts fresh.
  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [searchInput])

  const {
    data: searchData,
    isLoading,
    isStale,
  } = useSearch(isMyBooks ? '' : searchInput, limit)

  const apiBooks = searchData?.results ?? []
  const total = searchData?.total ?? 0

  const displayBooks = isMyBooks
    ? myBooks.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        description: b.description,
        ratings: b.ratings,
        coverUrl: b.coverUrl,
        status: 'completed' as const,
      }))
    : apiBooks

  const filteredBooks = isMyBooks
    ? displayBooks.filter((b) => {
        const q = searchInput.toLowerCase()
        return (
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q)
        )
      })
    : displayBooks

  // More server results available than we've loaded (search view only).
  const canLoadMore = !isMyBooks && apiBooks.length < total
  const isEmpty = !isLoading && filteredBooks.length === 0

  const gridRef = useRef<HTMLUListElement>(null)
  const [isMultiRow, setIsMultiRow] = useState(false)

  useEffect(() => {
    const update = () => {
      const container = gridRef.current
      if (!container) return

      const width = container.clientWidth
      const totalWidth =
        filteredBooks.length * MAX_CARD +
        Math.max(0, filteredBooks.length - 1) * GAP

      setIsMultiRow(totalWidth > width)
    }

    update()
    window.addEventListener('resize', update)

    return () => {
      window.removeEventListener('resize', update)
    }
  }, [filteredBooks.length])

  return (
    <div className="min-w-[360px]">
      <Header
        title={title || 'Library'}
        right={
          <div className="flex items-center gap-3">
            <SearchBar value={searchInput} onChange={setSearchInput} />
          </div>
        }
        backTo="/"
      />

      <main className="p-2.5 content-start">
        {isLoading && (
          <p className="text-sm opacity-50 mb-4 animate-pulse">Searching...</p>
        )}
        {isStale && !isLoading && (
          <p className="text-sm opacity-30 mb-4">Updating results...</p>
        )}
        {isEmpty &&
          (searchInput ? (
            <p className="text-sm opacity-50 mb-4">
              No results for &ldquo;{searchInput}&rdquo;
            </p>
          ) : isMyBooks ? (
            <p className="text-sm opacity-50 mb-4">
              Your library is empty. Add books from the catalog to see them
              here.
            </p>
          ) : (
            <p className="text-sm opacity-50 mb-4">
              No audiobooks yet. Upload one to get started.
            </p>
          ))}
        <section className="col-span-full">
          {/* <h2 className="pb-4 opacity-70 text-base">View All Books</h2> */}
          <ul
            ref={gridRef}
            className="grid gap-8 justify-start"
            style={{
              gridTemplateColumns: isMultiRow
                ? 'repeat(auto-fit,minmax(220px,1fr))'
                : 'repeat(auto-fit,minmax(220px,280px))',
            }}
          >
            {filteredBooks.map((book) => (
              <BookCard
                key={book.id}
                bookId={book.id}
                libraryTitle={title || 'Library'}
              />
            ))}

            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="animate-pulse">
                  <div className="aspect-2/3 bg-white/5 rounded" />
                  <div className="mt-2 h-4 bg-white/5 rounded w-3/4" />
                  <div className="mt-1 h-3 bg-white/5 rounded w-1/2" />
                </li>
              ))}
          </ul>

          {canLoadMore && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                disabled={isStale}
                className="btn-primary island-shell px-6 py-3"
              >
                {isStale
                  ? 'Loading…'
                  : `Load more (${apiBooks.length} of ${total})`}
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
