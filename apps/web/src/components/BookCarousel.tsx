import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import BookCard from './BookCard'

type Props = {
  title: string
  bookIds: string[]
  linkTo?: string
}

export default function BookCarousel({
  title,
  bookIds,
  linkTo = '/library',
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
  }, [])

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollRef.current
    if (!container) return

    const scrollAmount = container.clientWidth * 0.8

    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
    // The container's 'scroll' listener (see useEffect) keeps the button
    // enabled/disabled state in sync as the smooth scroll progresses.
  }

  const arrowClass = (disabled: boolean) =>
    disabled
      ? 'flex h-12 w-12 cursor-not-allowed items-center justify-center rounded-full border opacity-30 text-2xl font-bold'
      : 'feature-card flex h-12 w-12 items-center justify-center rounded-full border text-2xl font-bold hover:scale-105'

  return (
    <div className="mt-14">
      {/* Header */}
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
            disabled={!canScrollRight}
            aria-label={`Scroll ${title} right`}
            className={arrowClass(!canScrollRight)}
          >
            <span aria-hidden="true">›</span>
          </button>

          <Link to={linkTo} search={{ title }} className="nav-link">
            View All
          </Link>
        </div>
      </div>

      {/* Carousel */}
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
      </ul>
    </div>
  )
}
