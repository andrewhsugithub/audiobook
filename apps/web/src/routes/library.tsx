import { createFileRoute } from '@tanstack/react-router'
import { useFeaturedBooks } from '../utils/queries'
import { createStarString } from '../utils/createStarString'

export const Route = createFileRoute('/library')({
  component: Library,
})

function Library() {
  // const { data: featuredBooks } = useFeaturedBooks()
  const featuredBooks = [
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

  return (
    <>
      <header className="py-4 px-10 flex justify-between items-center gap-4 border-b-5 border-solid border-[rgba(245,240,214,0.12)] bg-(--brand-charcoal) sticky top-0 z-999">
        <h1 className="uppercase font-[--font-rye] font-bold cursor-pointer">
          <a
            href="#"
            className="no-underline ease-in-out duration-150 transition-all"
          >
            Library
          </a>
        </h1>
        <div className="relative">
          <input
            className="h-8 py-2 px-4 bg-(--panel-bg) rounded-md border border-solid border-[rgba(245,240,214,0.12)] font-(--font-outfit) text-sm text-(--body-text) ease-in-out duration-150 transition-all"
            type="text"
            name="search"
            id="search"
            autoComplete="off"
            autoCorrect="off"
            placeholder="Search"
            value=""
          />
        </div>
      </header>

      <main className="p-2.5 grid gap-2.5 content-start">
        <section className="col-span-full">
          {/* <h2 className="pb-4 opacity-70 text-base">View All Books</h2> */}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,220px))] gap-x-6 gap-y-10 justify-start">
            {featuredBooks?.map((book: any) => (
              <BookCard key={book.id} book={book} />
            ))}
          </ul>
        </section>
      </main>
    </>
  )
}

function BookCard({ book }: { book: any }) {
  return (
    <li key={book.id}>
      <a
        href={`/books/${book.id}`}
        className="aspect-[2/3] w-full block overflow-hidden rounded-[24px] shadow-lg transition-all duration-300 hover:scale-[1.02]"
      >
        <img
          src={book.thumbnail}
          alt={book.title}
          className="h-full w-full object-cover"
        />
      </a>
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
