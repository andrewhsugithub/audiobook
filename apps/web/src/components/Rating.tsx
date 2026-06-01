import { useMemo } from 'react'
import { FaStar, FaStarHalfAlt, FaRegStar } from 'react-icons/fa'

export default function Rating({ rating }: { rating: number }) {
  // Clamp to the supported 0–5 range so bad data can't render >5 or negative.
  const safeRating = Math.min(
    5,
    Math.max(0, Number.isFinite(rating) ? rating : 0),
  )

  const stars = useMemo(() => {
    const out = []
    for (let i = 1; i <= 5; i++) {
      if (safeRating >= i) {
        out.push(<FaStar key={i} aria-hidden="true" />)
      } else if (safeRating >= i - 0.5) {
        out.push(<FaStarHalfAlt key={i} aria-hidden="true" />)
      } else {
        out.push(<FaRegStar key={i} aria-hidden="true" />)
      }
    }
    return out
  }, [safeRating])

  return (
    <div
      className="flex gap-1 text-yellow-400"
      role="img"
      aria-label={`Rated ${safeRating} out of 5 stars`}
    >
      {stars}
    </div>
  )
}
