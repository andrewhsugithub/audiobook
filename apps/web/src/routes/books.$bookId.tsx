import { createFileRoute } from '@tanstack/react-router'
import { useBookQuery } from '../utils/queries'
import { createStarString } from '../utils/createStarString'

export const Route = createFileRoute('/books/$bookId')({
  component: RouteComponent,
})

function RouteComponent() {
  const bookId = Route.useParams().bookId
  const bookQuery = useBookQuery(bookId)

  return (
    <>
      <header className="py-4 px-10 flex justify-between items-center gap-4 border-b-5 border-solid border-[rgba(245,240,214,0.12)] bg-(--brand-charcoal) sticky top-0 z-999">
        <h1 className="uppercase font-[--font-rye] font-bold cursor-pointer">
          <a
            href="/library"
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
      <main className="p-2.5 content-start max-w-212.5 mx-auto gap-10 grid min-[551px]:grid-cols-[minmax(150px,1fr)_1.5fr]">
        <div>
          <span className="grid place-content-center overflow-hidden relative aspect-1/1.5 border border-solid border-[rgba(245,240,214,0.12)] shadow-[0.25rem_0.25rem_0_#0f0d0e]">
            {bookQuery.data ? (
              <img
                src={bookQuery.data.thumbnail}
                alt={bookQuery.data.title}
                className="min-w-full min-h-full top-0 left-0 absolute max-w-full"
              />
            ) : null}
          </span>
        </div>
        <div>
          <h2 className="opacity-100 text-[clamp(1.1rem,2.5vw,1.4rem)] pb-4">
            {bookQuery.data?.title || 'Loading...'}
          </h2>
          <small className="block opacity-70 text-xs">
            {bookQuery.data?.authors?.join(', ') || 'Anonymous'}
          </small>
          <span className="block pt-4">
            {bookQuery.data?.averageRating
              ? createStarString(bookQuery.data.averageRating)
              : 'No reviews'}
          </span>
          <div
            className="pt-4 overflow-hidden text-ellipsis"
            dangerouslySetInnerHTML={{
              __html:
                bookQuery.data?.description ||
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec a diam lectus. Sed sit amet ipsum mauris. Maecenas congue ligula ac quam viverra nec consectetur ante hendrerit. Donec et mollis dolor.',
            }}
          ></div>
        </div>
      </main>
    </>
  )
}
