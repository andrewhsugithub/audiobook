import { useRouter } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle'

import { FaArrowLeft } from 'react-icons/fa'

type Props = {
  title: string
  right?: React.ReactNode
  backTo?: string
  backSearch?: Record<string, string>
}

// Note: `backTo`/`backSearch` are accepted for call-site compatibility but the
// back button uses browser history (router.history.back()) instead.
export default function Header({ title, right }: Props) {
  const router = useRouter()

  return (
    <header className="sticky top-0 z-999 flex h-16 items-center justify-between bg-[var(--header-bg)] px-10 backdrop-blur-xl">
      {/* Back */}
      <button
        onClick={() => router.history.back()}
        aria-label="Go back"
        className="btn btn-ghost btn-circle btn-sm relative z-10"
      >
        <FaArrowLeft aria-hidden="true" />
      </button>

      {/* Current Library */}
      <div className="pointer-events-none absolute left-1/2 max-w-[min(52vw,34rem)] -translate-x-1/2 px-2">
        <h1 className="display-title truncate text-2xl font-bold">
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
