import { Bookmark } from 'lucide-react'

interface BookmarkButtonProps {
  isInLibrary: boolean
  onClick: () => void
}

export default function BookmarkButton({
  isInLibrary,
  onClick,
}: BookmarkButtonProps) {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        className="
          flex h-12 w-12 items-center justify-center
          rounded-full
          border border-white/10
          bg-[var(--chip-line)]
          transition-all duration-200
          hover:bg-[var(--chip-bg)]
        "
      >
        <Bookmark
          className={`
            h-6 w-6 transition-all duration-200
            ${isInLibrary ? 'fill-current text-[var(--bookmark-active)]' : 'text-[var(--bookmark-icon)]'}
          `}
        />
      </button>

      <div
        className="
          absolute left-full ml-2 top-1/2 -translate-y-1/2
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
        "
      >
        {isInLibrary ? 'Remove from Library' : 'Add to Library'}
      </div>
    </div>
  )
}
