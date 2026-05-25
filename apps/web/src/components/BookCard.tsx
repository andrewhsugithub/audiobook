import { Link } from '@tanstack/react-router'

type Props = {
  book: any
  libraryTitle: string
  variant?: 'library' | 'carousel'
}

export default function BookCard({
  book,
  libraryTitle,
  variant = 'library',
}: Props) {
  const isCarousel = variant === 'carousel'

  return (
    <li
      key={book.id}
      className={`group [perspective:900px] ${isCarousel ? 'w-[160px] shrink-0' : 'w-full'}`}
    >
      <Link
        to="/books/$bookId"
        params={{ bookId: String(book.id) }}
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

        {/* light reflection */}
        {/* <div className="absolute inset-0 z-20 bg-gradient-to-br from-white/25 via-transparent to-black/20" /> */}

        <div className="aspect-[2/3] w-full overflow-hidden">
          <img
            src={book.thumbnail}
            alt={book.title}
            className="h-full w-full object-cover"
          />
        </div>
      </Link>
      <h3 className="pt-4 text-[clamp(1rem,2.5vw,1.1rem)]/[1.2] font-bold overflow-hidden text-ellipsis">
        <a
          href="#"
          className="no-underline ease-in-out duration-150 transition-all"
        >
          {book.title}
        </a>
      </h3>
      <small className="block pt-2 uppercase opacity-70 text-xs">
        {book.authors.join(', ')}
      </small>
      {/* <span className="block pt-3 text-[0.6rem]">
        {book.averageRating
          ? createStarString(book.averageRating)
          : 'No reviews'}
      </span> */}
    </li>
  )
}
