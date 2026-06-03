import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { useAudiobookInfo } from '../hooks/useAudiobookInfo'

type Props = {
  bookId: string
  libraryTitle: string
  variant?: 'library' | 'carousel'
}

function BookCard({ bookId, libraryTitle, variant = 'library' }: Props) {
  const isCarousel = variant === 'carousel'

  const {
    data: book,
    isLoading: isInfoLoading,
    isError: isInfoError,
    error: infoError,
  } = useAudiobookInfo(bookId)

  if (isInfoError) {
    return (
      <div className="min-w-[360px] p-6 text-center text-red-400">
        <p className="font-semibold">Failed to load audiobook metadata:</p>
        <p className="text-sm opacity-70">{infoError?.message}</p>
      </div>
    )
  }

  return (
    <div
      key={bookId}
      className={`group [perspective:900px] ${isCarousel ? 'w-[160px] shrink-0' : 'w-full'}`}
    >
      <Link
        to="/books/$bookId"
        params={{ bookId: String(bookId) }}
        search={{ title: libraryTitle || 'Library' }}
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

        <div className="aspect-[2/3] w-full overflow-hidden">
          {isInfoLoading ? (
            <div className="animate-pulse text-xs opacity-40">
              Loading Cover...
            </div>
          ) : book?.coverUrl ? (
            <img
              src={book?.coverUrl}
              alt={book?.title}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
      </Link>
      <h3 className="pt-4 text-[clamp(1rem,2.5vw,1.1rem)]/[1.2] font-bold overflow-hidden text-ellipsis">
        {isInfoLoading ? (
          <span className="animate-pulse bg-white/10 rounded h-6 w-3/4 block"></span>
        ) : (
          <Link
            to="/books/$bookId"
            params={{ bookId: String(bookId) }}
            search={{ title: libraryTitle || 'Library' }}
            className="no-underline ease-in-out duration-150 transition-all"
          >
            {book?.title}
          </Link>
        )}
      </h3>
      <small className="block pt-2 uppercase opacity-70 text-xs">
        {isInfoLoading ? (
          <span className="animate-pulse bg-white/5 rounded h-4 w-1/2 block" />
        ) : (
          book?.author || 'Anonymous Author'
        )}
      </small>
    </div>
  )
}

export default memo(BookCard)
