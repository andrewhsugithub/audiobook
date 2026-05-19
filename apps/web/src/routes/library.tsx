import { createFileRoute, Link } from '@tanstack/react-router'
import { useFeaturedBooks } from '../utils/queries'
import { createStarString } from '../utils/createStarString'
import { useEffect, useRef, useState } from 'react'
import { FaArrowLeft, FaSearch } from 'react-icons/fa'

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

  const [search, setSearch] = useState('')

  const filteredBooks = books?.filter((book: any) => {
    const keyword = search.toLowerCase()

    return (
      book.title.toLowerCase().includes(keyword) ||
      book.authors.join(' ').toLowerCase().includes(keyword)
    )
  })

  return (
    <div className="min-w-[360px]">
      <header className="sticky top-0 z-999 flex h-16 items-center justify-between border-b-5 border-solid border-[rgba(245,240,214,0.12)] bg-(--brand-charcoal) px-10 backdrop-blur-xl">
        {/* Back */}
        <Link
          to="/"
          className="relative z-10 flex items-center gap-2 text-xl opacity-70 transition-all duration-300 hover:opacity-100"
        >
          <FaArrowLeft />
        </Link>

        {/* Current Library */}
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
          <h1 className="display-title text-2xl font-bold whitespace-nowrap">
            {title || 'Library'}
          </h1>
        </div>

        {/* Search */}
        <div className="relative z-10 hidden sm:block">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-sm opacity-50" />
          <input
            className="h-8 w-22 sm:w-32 md:w-42 lg:w-52 rounded-xl border border-white/10 bg-(--panel-bg) pl-10 pr-4 text-sm text-(--body-text) outline-none transition-all duration-300 focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[var(--lagoon)]/20"
            type="text"
            name="search"
            id="search"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
      </header>

      <main className="p-2.5 content-start">
        <section className="col-span-full">
          {/* <h2 className="pb-4 opacity-70 text-base">View All Books</h2> */}
          <ul
            ref={gridRef}
            className="grid gap-6 justify-start"
            style={{
              gridTemplateColumns: isMultiRow
                ? 'repeat(auto-fit,minmax(220px,1fr))'
                : 'repeat(auto-fit,minmax(220px,280px))',
            }}
          >
            {filteredBooks?.map((book: any) => (
              <BookCard key={book.id} book={book} />
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

function BookCard({ book }: { book: any }) {
  const { title } = Route.useSearch() as { title?: string }
  return (
    <li key={book.id} className="group [perspective:900px]">
      <Link
        to="/books/$bookId"
        params={{ bookId: String(book.id) }}
        search={{ title: title || 'Library' }}
        className="relative block overflow-hidden rounded-[4px]
          shadow-[0_18px_35px_rgba(0,0,0,0.22)]
          transition-all duration-300
          group-hover:[transform:rotateY(-8deg)_translateY(-8px)_scale(1.03)]"
      >
        {/* left shadow lines */}
        <div className="absolute left-0 top-0 z-10 h-full w-[4px] bg-gradient-to-r from-black/40 to-transparent" />
        <div className="absolute left-[4px] top-0 z-10 h-full w-[6px] bg-gradient-to-r from-white/20 to-transparent" />

        <div className="absolute left-[8px] top-0 z-10 h-full w-[4px] bg-gradient-to-l from-black/20 to-transparent" />
        <div className="absolute left-[12px] top-0 z-10 h-full w-[4px] bg-gradient-to-r from-black/20 to-transparent" />

        <div className="absolute right-0 top-0 z-10 h-full w-[4px] bg-gradient-to-l from-white/40 to-transparent" />

        {/* light reflection */}
        {/* <div className="absolute inset-0 z-20 bg-gradient-to-br from-white/25 via-transparent to-black/20" /> */}

        <div className="aspect-[2/3] w-full overflow-hidden">
          <img
            src={book.thumbnail}
            alt={book.title}
            className="h-full w-full object-cover"
          />
        </div>
      </Link>
      <h3 className="pt-4 text-[clamp(1rem,2.5vw,1.1rem)]/[1.2] font-bold overflow-hidden text-ellipsis">
        <a
          href="#"
          className="no-underline ease-in-out duration-150 transition-all"
        >
          {book.title}
        </a>
      </h3>
      <small className="block pt-2 uppercase opacity-70 text-xs">
        {book.authors.join(', ')}
      </small>
      <span className="block pt-3 text-[0.6rem]">
        {book.averageRating
          ? createStarString(book.averageRating)
          : 'No reviews'}
      </span>
    </li>
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
