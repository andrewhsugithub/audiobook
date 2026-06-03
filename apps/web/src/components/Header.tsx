import { Link, useRouter } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle'

import { FaArrowLeft } from 'react-icons/fa'

type Props = {
  title: string
  right?: React.ReactNode
  backTo?: string
  backSearch?: Record<string, string>
}

export default function Header({ title, right, backTo, backSearch }: Props) {
  const router = useRouter()

  return (
    <header className="sticky top-0 z-999 flex h-16 items-center justify-between border-b-5 border-solid border-[rgba(245,240,214,0.12)] bg-(--brand-charcoal) px-10 backdrop-blur-xl">
      {/* Back */}
      <button
        onClick={() => router.history.back()}
        aria-label="Go back"
        className="relative z-10 flex items-center gap-2 text-xl opacity-70 transition-all duration-300 hover:opacity-100"
      >
        <FaArrowLeft aria-hidden="true" />
      </button>

      {/* Current Library */}
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
        <h1 className="display-title text-2xl font-bold whitespace-nowrap">
          {title || 'Library'}
        </h1>
      </div>

      {/* Search + theme */}
      <div className="relative z-10 flex items-center gap-3">
        {right}
        <ThemeToggle />
      </div>
    </header>
  )
}
