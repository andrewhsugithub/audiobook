import { createFileRoute, Link } from '@tanstack/react-router'
import { useBookQuery } from '../utils/queries'
import { createStarString } from '../utils/createStarString'
import { Rating } from '../components/Rating'
import { useEffect, useState } from 'react'
import { FaPlay, FaPause, FaRedo, FaArrowLeft } from 'react-icons/fa'

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

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(75)
  const duration = 240
  const progress = (currentTime / duration) * 100
  const isFinished = currentTime >= duration

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60)
    const sec = seconds % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    if (!isPlaying) return

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= duration) {
          setIsPlaying(false)
          return duration
        }

        return prev + 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isPlaying, duration])

  return (
    <div className="min-w-[360px]">
      <header className="sticky top-0 z-999 flex h-16 items-center border-b-5 border-solid border-[rgba(245,240,214,0.12)] bg-(--brand-charcoal) px-10 backdrop-blur-xl">
        {/* Back */}
        <Link
          to="/library"
          search={{ title: title || 'Library' }}
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
      </header>
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

            <button className="island-shell rounded-full px-6 py-3">
              + My Library
            </button>
          </div>
          <div className="mt-8 max-w-xl">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  if (isFinished) {
                    setCurrentTime(0)
                    setIsPlaying(true)
                    return
                  }
                  setIsPlaying(!isPlaying)
                }}
                className="text-2xl text-[var(--sea-ink)] transition-all duration-300 hover:scale-110"
              >
                {isFinished ? <FaRedo /> : isPlaying ? <FaPause /> : <FaPlay />}
              </button>

              <div className="flex-1">
                <input
                  type="range"
                  min="0"
                  max={duration}
                  value={currentTime}
                  onChange={(e) => setCurrentTime(Number(e.target.value))}
                  className="w-full accent-[var(--lagoon)]"
                  style={{
                    background: `linear-gradient(to right, var(--lagoon) ${progress}%, rgba(0,0,0,0.12) ${progress}%)`,
                  }}
                />

                <div className="mt-1 flex justify-between text-sm text-[var(--sea-ink-soft)]">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          </div>
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
