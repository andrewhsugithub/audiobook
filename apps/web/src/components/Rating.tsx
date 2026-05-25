import { FaStar, FaStarHalfAlt, FaRegStar } from 'react-icons/fa'

export default function Rating({ rating }: { rating: number }) {
  const stars = []

  for (let i = 1; i <= 5; i++) {
    if (rating >= i) {
      stars.push(<FaStar key={i} />)
    } else if (rating >= i - 0.5) {
      stars.push(<FaStarHalfAlt key={i} />)
    } else {
      stars.push(<FaRegStar key={i} />)
    }
  }

  return <div className="flex gap-1 text-yellow-400">{stars}</div>
}
