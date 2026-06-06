import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import BookCard from '../components/BookCard'
import Header from '../components/Header'
import SortSelect from '../components/SortSelect'
import Pagination from '../components/Pagination'
import { userProfileQuery } from '../utils/queries'
import type { SortKey } from '../utils/queries'
import { useSearch } from '../hooks/useSearch'

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 20, 50]

export const Route = createFileRoute('/users/$userId')({
  head: () => ({ meta: [{ title: 'Uploads · Audiobook' }] }),
  component: UserBooksPage,
})

function UserBooksPage() {
  const userId = Route.useParams().userId
  // Name is passed from the book page for an instant title; deep links fall
  // back to the fetched profile below.
  const { name: passedName } = Route.useSearch() as { name?: string }

  const [sort, setSort] = useState<SortKey>('recent')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(1)

  // Reset to page 1 whenever sort or page size changes.
  useEffect(() => {
    setPage(1)
  }, [sort, pageSize])

  const offset = (page - 1) * pageSize

  const { data: profileData } = useQuery(userProfileQuery(userId))
  const profile = profileData?.user
  const displayName = profile?.name ?? passedName ?? 'this user'

  const {
    data: searchData,
    isLoading,
    isFetching,
  } = useSearch({
    q: '',
    limit: pageSize,
    offset,
    sort,
    userId,
  })

  const books = searchData?.results ?? []
  const total = searchData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Clamp the page if the result set shrank under us.
  useEffect(() => {
    if (!isLoading && page > totalPages) setPage(totalPages)
  }, [isLoading, page, totalPages])

  const isEmpty = !isLoading && books.length === 0

  return (
    <div className="min-w-[360px] pb-20">
      <Header
        title={profile?.name ?? passedName ?? 'Uploads'}
        backTo="/library"
      />

      <main className="mx-auto max-w-7xl p-4 content-start">
        {/* Profile banner */}
        <div className="mb-8 flex items-center gap-4">
          {profile?.image ? (
            <img
              src={profile.image}
              alt={displayName}
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid h-14 w-14 place-content-center rounded-full bg-[var(--chip-bg)] text-lg font-semibold uppercase"
            >
              {(profile?.name ?? passedName ?? '?').charAt(0)}
            </span>
          )}
          <div>
            <h2 className="display-title text-2xl font-bold">{displayName}</h2>
            <p className="text-sm text-[var(--sea-ink-soft)]">
              {isLoading
                ? 'Loading…'
                : `${total} ${total === 1 ? 'book' : 'books'} uploaded`}
            </p>
          </div>
        </div>

        {/* Sort */}
        <div className="mb-6 flex items-center justify-end">
          <SortSelect value={sort} onChange={setSort} />
        </div>

        {isEmpty && (
          <p className="py-16 text-center text-sm text-[var(--sea-ink-soft)]">
            No books from {displayName} yet.
          </p>
        )}

        <ul
          className="grid gap-8 justify-start"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 280px))',
          }}
        >
          {books.map((book) => (
            <BookCard
              key={book.id}
              bookId={book.id}
              libraryTitle={displayName}
            />
          ))}

          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="animate-pulse">
                <div className="aspect-[2/3] bg-[var(--line)] rounded" />
                <div className="mt-2 h-4 bg-[var(--line)] rounded w-3/4" />
              </li>
            ))}
        </ul>

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
      </main>
    </div>
  )
}
