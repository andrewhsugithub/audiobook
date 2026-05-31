import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import BookCard from '../components/BookCard'
import Header from '../components/Header'
import SearchBar from '../components/SearchBar'
import UploadButton from '../components/UploadButton'
import { searchQuery } from '../utils/queries'
import { useSearch } from '../hooks/useSearch'

export const Route = createFileRoute('/library')({
  // Prefetch default search (empty = recent books) when route loads
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(searchQuery(''))
  },
  component: Library,
})

const MAX_CARD = 280
const GAP = 24

function Library() {
  // const { data: featuredBooks } = useFeaturedBooks()
  const { title } = Route.useSearch() as { title?: string }
  const [searchInput, setSearchInput] = useState('')
  const [uploadedBooks, setUploadedBooks] = useState<any[]>([])

  const isMyBooks = title === 'My Books'

  const myBooks = isMyBooks
    ? (JSON.parse(localStorage.getItem('myBooks') || '[]') as Array<{
        id: string
        title: string
        author: string
        coverURL: string
        ratings: number
        description: string
      }>)
    : []

  const {
    data: searchData,
    isLoading,
    isStale,
  } = useSearch(isMyBooks ? '' : searchInput)

  const apiBooks = searchData?.results ?? []

  const displayBooks = isMyBooks
    ? myBooks.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        description: b.description,
        ratings: b.ratings,
        coverUrl: b.coverURL,
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

  const handlePdfUpload = (files: FileList | null) => {
    if (!files) return

    const newBooks = Array.from(files)
      .filter((file) => file.type === 'application/pdf')
      .map((file, index) => ({
        id: `uploaded-${Date.now()}-${index}`,

        title: file.name.replace('.pdf', ''),

        author: 'Upload PDF',

        coverURL: 'https://placehold.co/300x450?text=PDF',

        ratings: 0,

        file,
      }))

    setUploadedBooks((prev) => [...prev, ...newBooks])
  }

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
            {isMyBooks && <UploadButton onUpload={handlePdfUpload} />}
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
        {!isLoading && searchInput && filteredBooks.length === 0 && (
          <p className="text-sm opacity-50 mb-4">
            No results for &ldquo;{searchInput}&rdquo;
          </p>
        )}
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
        </section>
      </main>
    </div>
  )
}
