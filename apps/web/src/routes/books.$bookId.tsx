import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import Rating from '../components/Rating'
import Header from '../components/Header'
import AudioPlayer from '../components/AudioPlayer'
import { HlsAudioPlayer } from '../components/HlsAudio'
import { useHlsStream } from '../hooks/useHlsStream'
import { useAudiobookInfo } from '../hooks/useAudiobookInfo'

export const Route = createFileRoute('/books/$bookId')({
  component: BookComponent,
})

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'

function BookComponent() {
  const { title } = Route.useSearch() as { title?: string }
  const bookId = Route.useParams().bookId

  const {
    data: book,
    isLoading: isInfoLoading,
    isError: isInfoError,
    error: infoError,
  } = useAudiobookInfo(bookId)

  const {
    isLoading: isStreamLoading,
    isError: isStreamError,
    error: streamError,
    isSuccess: isStreamReady,
  } = useHlsStream(bookId, {
    enabled: book?.isReady === true,
  })
  // const audioURL =
  //   'https://playertest.longtailvideo.com/adaptive/alt-audio-no-video/angel-one.m3u8'
  // const audioURL =
  //   'https://stream.mux.com/BV3YZtogl89mg9VcNBhhnHm02Y34zI1nlMuMQfAbl3dM/highest.mp4'
  // const bookQuery = useBookQuery(bookId)

  const audioURL = `${BASE_URL}/audiobook/${bookId}/master.m3u8`

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

    if (!book) return

    const savedBooks = JSON.parse(localStorage.getItem('myBooks') || '[]')

    localStorage.setItem('myBooks', JSON.stringify([...savedBooks, book]))

    setIsInLibrary(true)
  }

  if (isInfoError) {
    return (
      <div className="min-w-[360px] p-6 text-center text-red-400">
        <p className="font-semibold">Failed to load audiobook metadata:</p>
        <p className="text-sm opacity-70">{infoError?.message}</p>
      </div>
    )
  }

  return (
    <div className="min-w-[360px]">
      <Header
        title={title || book?.title || 'Loading Audio Title...'}
        backTo="/library"
        backSearch={{ title: title || 'Library' }}
      />
      <main className="p-2.5 content-start max-w-212.5 mx-auto gap-10 grid min-[551px]:grid-cols-[minmax(150px,1fr)_1.5fr]">
        {/* <div className="absolute inset-0 -z-10 overflow-hidden">
          <img
            src={bookQuery.data?.thumbnail}
            className="h-full w-full object-cover blur-3xl opacity-20 scale-110"
          />
        </div> */}
        <div className="group [perspective:900px]">
          <span className="grid place-content-center overflow-hidden relative aspect-1/1.5 border border-solid border-[rgba(245,240,214,0.12)] shadow-[0.25rem_0.25rem_0_#0f0d0e] bg-neutral-900">
            {isInfoLoading ? (
              <div className="animate-pulse text-xs opacity-40">
                Loading Cover...
              </div>
            ) : book?.coverUrl ? (
              <img
                src={book.coverUrl}
                alt={book.title}
                className="min-w-full min-h-full top-0 left-0 absolute object-cover"
              />
            ) : null}
          </span>
        </div>
        <div className="flex flex-col justify-center">
          <h2 className="display-title text-3xl font-bold">
            {isInfoLoading ? (
              <span className="animate-pulse bg-white/10 rounded h-8 w-48 block"></span>
            ) : (
              book?.title
            )}
          </h2>

          <small className="mt-4 text-xl uppercase opacity-70 block">
            {isInfoLoading ? (
              <span className="animate-pulse bg-white/5 rounded h-5 w-24 block" />
            ) : (
              book?.author || 'Anonymous Author'
            )}
          </small>

          <span className="block pt-4">
            {!isInfoLoading && book?.ratings ? (
              <Rating rating={book.ratings} />
            ) : (
              <span className="text-sm opacity-50">
                No structural reviews yet
              </span>
            )}
          </span>

          <div className="mt-8 flex gap-4">
            {/* <button className="rounded-full bg-white px-6 py-3 font-semibold text-black">
              ▶ Listen Now
            </button> */}

            <button
              onClick={addToMyLibrary}
              disabled={isInLibrary || isInfoLoading}
              className={`
                rounded-full px-6 py-3 transition-all duration-300
                ${
                  isInLibrary || isInfoLoading
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
          <div className="mt-6 min-h-[60px] flex flex-col justify-center">
            {isStreamLoading && (
              <div className="text-sm opacity-60 animate-pulse flex items-center gap-2">
                <span>🔒</span> Establishing secure audio stream connection...
              </div>
            )}
            {isStreamError && (
              <div className="text-sm text-red-400 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                ⚠️ Secure Stream Error: {streamError.message}
              </div>
            )}
            {isStreamReady && (
              <HlsAudioPlayer src={audioURL} title={book?.title} />
            )}
          </div>
          {/* <AudioPlayer duration={240} initialTime={75} /> */}
          <div
            className="mt-10 max-w-3xl leading-8 text-[var(--sea-ink-soft)]"
            dangerouslySetInnerHTML={{
              __html:
                book?.description ||
                '<i>No description available for this volume.</i>',
            }}
          ></div>
        </div>
      </main>
    </div>
  )
}
