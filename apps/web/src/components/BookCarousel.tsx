import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'

type Props = {
  title: string
  books: string[]
}

export default function BookCarousel({ title, books }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
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

    setTimeout(updateScrollButtons, 350)
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
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className={arrowClass(!canScrollLeft)}
          >
            ‹
          </button>

          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className={arrowClass(!canScrollRight)}
          >
            ›
          </button>

          <Link to="/library" className="nav-link">
            View All
          </Link>
        </div>
      </div>

      {/* Carousel */}
      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto px-6 pb-6 pt-2 scroll-smooth"
      >
        {books.map((book) => (
          <div
            key={book}
            className="feature-card min-w-[240px] rounded-[28px] border p-5"
          >
            <div className="mb-6 h-44 rounded-2xl bg-gradient-to-br from-teal-300 to-emerald-500" />

            <h3 className="text-lg font-bold">{book}</h3>

            <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
              Audiobook Collection
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
