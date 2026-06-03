import { Link } from '@tanstack/react-router'

function UploadBookButton() {
  return (
    <Link to="/upload" className="group block">
      <li className="list-none">
        {/* Book spine shape */}
        <div
          className="
            relative aspect-[2/3] rounded-xl overflow-hidden
            border-2 border-dashed border-[var(--line)]
            bg-[var(--surface)]
            hover:border-[var(--lagoon)] hover:bg-[var(--surface-strong)]
            transition-all duration-300
            flex flex-col items-center justify-center gap-3
            cursor-pointer
            group-hover:scale-[1.02]
          "
          style={{ minWidth: 160, maxWidth: 280 }}
        >
          {/* Book spine highlight (left edge) */}
          <div className="absolute left-0 top-0 bottom-0 w-3 bg-[var(--chip-bg)] border-r border-[var(--line)] rounded-l-xl" />

          {/* Content */}
          <span className="text-4xl opacity-50 group-hover:opacity-80 transition-opacity">
            📖
          </span>
          <span className="text-sm font-medium text-[var(--sea-ink-soft)] group-hover:text-[var(--sea-ink)] transition-colors text-center px-4">
            Upload New Book
          </span>
          <span className="text-xs text-[var(--sea-ink-soft)]/70 group-hover:text-[var(--sea-ink-soft)] transition-colors">
            PDF · TXT · Text
          </span>

          {/* Plus badge */}
          <div
            className="
            absolute top-3 right-3
            w-6 h-6 rounded-full
            bg-[var(--chip-bg)] border border-[var(--chip-line)] group-hover:bg-[var(--surface-strong)]
            flex items-center justify-center
            transition-colors
          "
          >
            <span className="text-[var(--sea-ink-soft)] text-sm leading-none">
              +
            </span>
          </div>
        </div>

        <p className="mt-2 text-sm font-medium text-[var(--sea-ink-soft)] group-hover:text-[var(--sea-ink)] transition-colors text-center">
          Upload
        </p>
      </li>
    </Link>
  )
}

export default UploadBookButton
