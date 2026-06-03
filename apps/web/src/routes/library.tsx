import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import BookCard from '../components/BookCard'
import Header from '../components/Header'
import SearchBar from '../components/SearchBar'
import SortSelect from '../components/SortSelect'
import Pagination from '../components/Pagination'
import { searchQuery } from '../utils/queries'
import type { SortKey } from '../utils/queries'
import { useSearch } from '../hooks/useSearch'

const DEFAULT_PAGE_SIZE = 10

export const Route = createFileRoute('/library')({
  head: () => ({ meta: [{ title: 'Library · Audiobook' }] }),
  // Prefetch the first page (empty query = recent books) when the route loads
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      searchQuery('', DEFAULT_PAGE_SIZE),
    )
  },
  component: Library,
})

const MAX_CARD = 280
const GAP = 24
const PAGE_SIZE_OPTIONS = [10, 20, 50]

function Library() {
  const [searchInput, setSearchInput] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(1)

  // Start over from page 1 whenever the query, sort, or page size changes.
  useEffect(() => {
    setPage(1)
  }, [searchInput, sort, pageSize])

  const offset = (page - 1) * pageSize
  const {
    data: searchData,
    isLoading,
    isStale,
    isFetching,
  } = useSearch(searchInput, pageSize, offset, sort)

  const books = searchData?.results ?? []
  const total = searchData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // If the result set shrank under us (e.g. a narrower search), clamp the page.
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

    return () => {
      window.removeEventListener('resize', update)
    }
  }, [books.length])

  // Range label like "1–10 of 42"
  const rangeStart = total === 0 ? 0 : offset + 1
  const rangeEnd = Math.min(offset + books.length, total)

  return (
    <div className="min-w-[360px]">
      <Header
        title={'Library'}
        right={
          <div className="flex items-center gap-3">
            <SearchBar value={searchInput} onChange={setSearchInput} />
          </div>
        }
        backTo="/"
      />

      <main className="mx-auto max-w-7xl p-4 content-start">
        {/* Toolbar: result summary + sort */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="min-h-5 text-sm text-[var(--sea-ink-soft)]">
            {isLoading ? (
              <span className="animate-pulse">Searching…</span>
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

          <SortSelect value={sort} onChange={setSort} />
        </div>

        {isEmpty &&
          (searchInput ? (
            <p className="py-16 text-center text-sm text-[var(--sea-ink-soft)]">
              No results for &ldquo;{searchInput}&rdquo;.
            </p>
          ) : (
            <p className="py-16 text-center text-sm text-[var(--sea-ink-soft)]">
              No audiobooks yet. Upload one to get started.
            </p>
          ))}

        <section className="col-span-full">
          <ul
            ref={gridRef}
            className="grid gap-8 justify-start"
            style={{
              gridTemplateColumns: isMultiRow
                ? 'repeat(auto-fit,minmax(220px,1fr))'
                : 'repeat(auto-fit,minmax(220px,280px))',
            }}
          >
            {books.map((book) => (
              <BookCard
                key={book.id}
                bookId={book.id}
                libraryTitle={'Library'}
              />
            ))}

            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="animate-pulse">
                  <div className="aspect-2/3 bg-[var(--line)] rounded" />
                  <div className="mt-2 h-4 bg-[var(--line)] rounded w-3/4" />
                  <div className="mt-1 h-3 bg-[var(--line)] rounded w-1/2" />
                </li>
              ))}
          </ul>

          {/* Show the pagination bar (incl. the per-page selector) whenever
              there are more books than the smallest page size could fit. */}
          {!isEmpty && total > PAGE_SIZE_OPTIONS[0] && (
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
