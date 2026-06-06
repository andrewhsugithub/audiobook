import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import BookCard from './BookCard'

type Props = {
  title: string
  bookIds: string[]
  linkTo?: string
  fetchNextPage?: () => void
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
}

export default function BookCarousel({
  title,
  bookIds,
  linkTo = '/library',
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: Props) {
  const scrollRef = useRef<HTMLUListElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const updateScrollButtons = () => {
    const container = scrollRef.current
    if (!container) return

    const { scrollLeft, scrollWidth, clientWidth } = container
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5)

    // Infinite scroll trigger: if within 200px of the right edge
    if (scrollLeft + clientWidth >= scrollWidth - 200) {
      if (hasNextPage && !isFetchingNextPage && fetchNextPage) {
        fetchNextPage()
      }
    }
  }

  useEffect(() => {
    updateScrollButtons()
    const container = scrollRef.current
    if (!container) return

    container.addEventListener('scroll', updateScrollButtons)
    window.addEventListener('resize', updateScrollButtons)
    return () => {
      container.removeEventListener('scroll', updateScrollButtons)
      window.removeEventListener('resize', updateScrollButtons)
    }
  }, [bookIds.length, hasNextPage, isFetchingNextPage])

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollRef.current
    if (!container) return
    container.scrollBy({
      left:
        direction === 'left'
          ? -container.clientWidth * 0.8
          : container.clientWidth * 0.8,
      behavior: 'smooth',
    })
  }

  const arrowClass = (disabled: boolean) =>
    disabled
      ? 'flex h-12 w-12 cursor-not-allowed items-center justify-center rounded-full border opacity-30 text-2xl font-bold'
      : 'feature-card flex h-12 w-12 items-center justify-center rounded-full border text-2xl font-bold hover:scale-105'

  return (
    <div className="mt-14">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="display-title text-3xl font-bold">{title}</h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            aria-label={`Scroll ${title} left`}
            className={arrowClass(!canScrollLeft)}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            disabled={!canScrollRight && !hasNextPage}
            aria-label={`Scroll ${title} right`}
            className={arrowClass(!canScrollRight && !hasNextPage)}
          >
            <span aria-hidden="true">›</span>
          </button>
          <Link to={linkTo} search={{ title }} className="nav-link">
            View All
          </Link>
        </div>
      </div>

      <ul
        ref={scrollRef}
        role="region"
        aria-label={`${title} audiobooks`}
        className="flex gap-15 overflow-x-auto px-6 pb-6 pt-2 scroll-smooth no-scrollbar list-none"
      >
        {bookIds.map((bookId) => (
          <BookCard
            key={bookId}
            bookId={bookId}
            libraryTitle={title || 'Library'}
            variant="carousel"
          />
        ))}

        {isFetchingNextPage &&
          Array.from({ length: 3 }).map((_, i) => (
            <li
              key={`skeleton-${i}`}
              className="w-[160px] shrink-0 animate-pulse"
            >
              <div className="aspect-[2/3] w-full rounded bg-[var(--line)]" />
              <div className="mt-3 h-4 w-3/4 rounded bg-[var(--line)]" />
              <div className="mt-2 h-3 w-1/2 rounded bg-[var(--line)]" />
            </li>
          ))}

        {bookIds.length === 0 && !isFetchingNextPage && (
          <p className="text-sm opacity-50">No books available.</p>
        )}
      </ul>
    </div>
  )
}
