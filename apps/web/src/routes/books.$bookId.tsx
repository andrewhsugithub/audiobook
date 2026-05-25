import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import Rating from '../components/Rating'
import Header from '../components/Header'
import AudioPlayer from '../components/AudioPlayer'

export const Route = createFileRoute('/books/$bookId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { title } = Route.useSearch() as { title?: string }
  const bookId = Route.useParams().bookId
  // const bookQuery = useBookQuery(bookId)

  const fakeBook = {
    id: bookId,
    title: 'Atomic Habits',
    authors: ['James Clear'],
    thumbnail: 'https://placehold.co/300x450',
    averageRating: 4.8,
    description: 'A practical guide about building better habits.',
  }
  const bookQuery = { data: fakeBook }

  const savedBooks = JSON.parse(localStorage.getItem('myBooks') || '[]')

  const [isInLibrary, setIsInLibrary] = useState(false)

  useEffect(() => {
    const savedBooks = JSON.parse(localStorage.getItem('myBooks') || '[]')

    const exists = savedBooks.some(
      (item: any) => String(item.id) === String(bookId),
    )

    setIsInLibrary(exists)
  }, [bookId])

  const addToMyLibrary = () => {
    if (isInLibrary) return

    const book = bookQuery.data
    if (!book) return

    const savedBooks = JSON.parse(localStorage.getItem('myBooks') || '[]')

    localStorage.setItem('myBooks', JSON.stringify([...savedBooks, book]))

    setIsInLibrary(true)
  }

  return (
    <div className="min-w-[360px]">
      <Header
        title={title || 'Library'}
        backTo="/library"
        backSearch={{
          title: title || 'Library',
        }}
      />
      <main className="p-2.5 content-start max-w-212.5 mx-auto gap-10 grid min-[551px]:grid-cols-[minmax(150px,1fr)_1.5fr]">
        {/* <div className="absolute inset-0 -z-10 overflow-hidden">
          <img
            src={bookQuery.data?.thumbnail}
            className="h-full w-full object-cover blur-3xl opacity-20 scale-110"
          />
        </div> */}
        <div className="group [perspective:900px]">
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
        <div className="flex flex-col justify-center">
          <h2 className="display-title text-3xl font-bold">
            {bookQuery.data?.title || 'Loading...'}
          </h2>
          <small className="mt-4 text-xl uppercase opacity-70">
            {bookQuery.data?.authors?.join(', ') || 'Anonymous'}
          </small>
          <span className="block pt-4">
            {bookQuery.data?.averageRating ? (
              <Rating rating={bookQuery.data.averageRating} />
            ) : (
              'No reviews'
            )}
          </span>
          <div className="mt-8 flex gap-4">
            {/* <button className="rounded-full bg-white px-6 py-3 font-semibold text-black">
              ▶ Listen Now
            </button> */}

            <button
              onClick={addToMyLibrary}
              disabled={isInLibrary}
              className={`
                rounded-full px-6 py-3
                transition-all duration-300

                ${
                  isInLibrary
                    ? `
                      cursor-not-allowed
                      opacity-50
                      bg-white/5
                    `
                    : `
                      island-shell
                      hover:scale-105
                    `
                }
              `}
            >
              {isInLibrary ? '✓ In My Library' : '+ My Library'}
            </button>
          </div>
          <AudioPlayer duration={240} initialTime={75} />
          <div
            className="mt-10 max-w-3xl leading-8 text-[var(--sea-ink-soft)]"
            dangerouslySetInnerHTML={{
              __html:
                bookQuery.data?.description ||
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec a diam lectus. Sed sit amet ipsum mauris. Maecenas congue ligula ac quam viverra nec consectetur ante hendrerit. Donec et mollis dolor.',
            }}
          ></div>
        </div>
      </main>
    </div>
  )
}
