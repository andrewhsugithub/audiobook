import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { useFeaturedBooks } from '../utils/queries'

import BookCard from '../components/BookCard'
import Header from '../components/Header'
import SearchBar from '../components/SearchBar'
import UploadButton from '../components/UploadButton'

export const Route = createFileRoute('/library')({
  component: Library,
})

const MAX_CARD = 280
const GAP = 24

function Library() {
  // const { data: featuredBooks } = useFeaturedBooks()
  const { title } = Route.useSearch() as { title?: string }
  const books = [
    {
      id: 1,
      title: 'Atomic Habits',
      authors: ['James Clear'],
      thumbnail: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f',
      averageRating: 4.8,
    },
    {
      id: 2,
      title: 'Deep Work',
      authors: ['Cal Newport'],
      thumbnail: 'https://images.unsplash.com/photo-1512820790803-83ca734da794',
      averageRating: 4.5,
    },
    {
      id: 3,
      title: 'Harry Potter',
      authors: ['J.K. Rowling'],
      thumbnail: 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d',
      averageRating: 4.9,
    },
  ]

  const [uploadedBooks, setUploadedBooks] = useState<any[]>([])
  const [myLibraryBooks, setMyLibraryBooks] = useState<any[]>([])
  const [search, setSearch] = useState('')

  const isMyBooks = title === 'My Books'

  useEffect(() => {
    if (!isMyBooks) return

    const savedBooks = JSON.parse(localStorage.getItem('myBooks') || '[]')
    setMyLibraryBooks(savedBooks)
  }, [isMyBooks])

  const displayBooks = isMyBooks ? [...myLibraryBooks, ...uploadedBooks] : books

  const filteredBooks = displayBooks?.filter((book: any) => {
    const keyword = search.toLowerCase()

    return (
      book.title.toLowerCase().includes(keyword) ||
      book.authors.join(' ').toLowerCase().includes(keyword)
    )
  })

  const handlePdfUpload = (files: FileList | null) => {
    if (!files) return

    const newBooks = Array.from(files)
      .filter((file) => file.type === 'application/pdf')
      .map((file, index) => ({
        id: `uploaded-${Date.now()}-${index}`,

        title: file.name.replace('.pdf', ''),

        authors: ['Uploaded PDF'],

        thumbnail: 'https://placehold.co/300x450?text=PDF',

        averageRating: 0,

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
            <SearchBar value={search} onChange={setSearch} />
          </div>
        }
        backTo="/"
      />

      <main className="p-2.5 content-start">
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
            {filteredBooks?.map((book: any) => (
              <BookCard
                key={book.id}
                book={book}
                libraryTitle={title || 'Library'}
              />
            ))}
            {filteredBooks?.length === 0 && (
              <p className="text-[var(--sea-ink-soft)]">No books found.</p>
            )}
          </ul>
        </section>
      </main>
    </div>
  )
}

export function NoResults() {
  return <div>Sorry, no results found ...</div>
}

export function ErrorMessage() {
  return <div>Woops there was an error...</div>
}

export function Searching() {
  return <div>Searching...</div>
}

export function HasNotSearched() {
  return <div>Please search for a book</div>
}
