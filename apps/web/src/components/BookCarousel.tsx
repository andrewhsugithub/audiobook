import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { createStarString } from '../utils/createStarString'
import BookCard from './BookCard'

type Book = {
  id: number | string
  title: string
  authors: string[]
  thumbnail: string
  averageRating?: number
}

type Props = {
  title: string
  books: Book[]
  linkTo?: string
}

export default function BookCarousel({
  title,
  books,
  linkTo = '/library',
}: Props) {
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

          <Link to={linkTo} search={{ title }} className="nav-link">
            View All
          </Link>
        </div>
      </div>

      {/* Carousel */}
      <div
        ref={scrollRef}
        className="flex gap-15 overflow-x-auto px-6 pb-6 pt-2 scroll-smooth no-scrollbar list-none"
      >
        {books.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            libraryTitle={title || 'Library'}
            variant="carousel"
          />
          // <div key={book.id}>
          //   <Link
          //     to="/books/$bookId"
          //     params={{
          //       bookId: String(book.id),
          //     }}
          //     search={{ title }}
          //     className="block"
          //   >
          //     <div className="relative overflow-hidden rounded-[12px] shadow-[0_18px_35px_rgba(0,0,0,0.22)] transition-all duration-300 hover:scale-[1.03]">
          //       <div className="aspect-[2/3] w-[220px] overflow-hidden">
          //         <img
          //           src={book.thumbnail}
          //           alt={book.title}
          //           className="h-full w-full object-cover"
          //         />
          //       </div>
          //     </div>
          //     <h3 className="pt-4 line-clamp-1 text-lg font-bold overflow-hidden text-ellipsis transition-all duration-300 hover:opacity-80">
          //       {book.title}
          //     </h3>
          //   </Link>
          //   <small className="block pt-2 uppercase opacity-70 text-xs">
          //     {book.authors.join(', ')}
          //   </small>
          //   <span className="block pt-3 text-[0.6rem]">
          //     {book.averageRating
          //       ? createStarString(book.averageRating)
          //       : 'No reviews'}
          //   </span>
          // </div>
        ))}
      </div>
    </div>
  )
}
