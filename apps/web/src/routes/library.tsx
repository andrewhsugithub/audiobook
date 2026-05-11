import { createFileRoute } from '@tanstack/react-router'
import { useFeaturedBooks } from '../utils/queries'
import { createStarString } from '../utils/createStarString'

export const Route = createFileRoute('/library')({
  component: Library,
})

function Library() {
  const { data: featuredBooks } = useFeaturedBooks()

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
            placeholder="Search books"
            value=""
          />
        </div>
      </header>
      <main className="p-2.5 grid gap-2.5 content-start">
        <section className="col-span-full">
          <h2 className="pb-4 opacity-70 text-base">Featured Books</h2>
          <ul className="grid gap-x-4 gap-y-10 grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
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
        className="grid content-center overflow-hidden relative aspect-1/1.5 border border-solid border-[rgba(245,240,214,0.12)] shadow-[0.25rem_0.25rem_0_#0f0d0e]"
      >
        <img
          src={book.thumbnail}
          alt={book.title}
          className="min-w-full min-h-full max-w-full top-0 left-0 absolute"
        />
      </a>
      <h3 className="pt-3 text-[clamp(1rem,2.5vw,1.1rem)]/[1.2] overflow-hidden text-ellipsis">
        <a
          href="#"
          className="no-underline ease-in-out duration-150 transition-all"
        >
          {book.title}
        </a>
      </h3>
      <small className="pt-1.5 uppercase opacity-70 text-xs">
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
