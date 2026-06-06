import { Bookmark, Loader2 } from 'lucide-react'

interface BookmarkButtonProps {
  isInLibrary: boolean
  onClick: () => void
  isLoading: boolean
}

export default function BookmarkButton({
  isInLibrary,
  onClick,
  isLoading,
}: BookmarkButtonProps) {
  return (
    <div className="group relative inline-block">
      <button
        type="button"
        onClick={onClick}
        aria-label={isInLibrary ? 'Remove from Library' : 'Add to Library'}
        aria-pressed={isInLibrary}
        className="btn btn-circle btn-lg btn-soft"
      >
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-[var(--sea-ink-soft)]" />
        ) : (
          <Bookmark
            className={`
              h-6 w-6 transition-all duration-200
              ${isInLibrary ? 'fill-current text-[var(--bookmark-active)] scale-110' : ''}
            `}
          />
        )}
      </button>

      <div
        className="
          absolute top-full left-1/2 mt-2 -translate-x-1/2
          whitespace-nowrap
          rounded-lg
          border border-[var(--chip-line)]
          bg-[var(--chip-bg)]
          backdrop-blur-md
          px-3 py-1.5
          text-xs
          text-[var(--sea-ink)]
          shadow-lg
          opacity-0
          group-hover:opacity-100
          transition-all duration-200
          pointer-events-none
          z-20
        "
      >
        {isInLibrary ? 'Remove from Library' : 'Add to Library'}
      </div>
    </div>
  )
}
