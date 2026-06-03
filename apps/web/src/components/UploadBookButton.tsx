import { Link } from '@tanstack/react-router'

function UploadBookButton() {
  return (
    <Link to="/upload" className="group block">
      <li className="list-none">
        {/* Book spine shape */}
        <div
          className="
            relative aspect-[2/3] rounded-sm overflow-hidden
            border-2 border-dashed border-white/20
            hover:border-white/50 hover:bg-white/5
            transition-all duration-300
            flex flex-col items-center justify-center gap-3
            cursor-pointer
            group-hover:scale-[1.02]
          "
          style={{ minWidth: 160, maxWidth: 280 }}
        >
          {/* Book spine highlight (left edge) */}
          <div className="absolute left-0 top-0 bottom-0 w-3 bg-white/5 border-r border-white/10 rounded-l-sm" />

          {/* Content */}
          <span className="text-4xl opacity-40 group-hover:opacity-70 transition-opacity">
            📖
          </span>
          <span className="text-sm font-medium text-white/40 group-hover:text-white/70 transition-colors text-center px-4">
            Upload New Book
          </span>
          <span className="text-xs text-white/20 group-hover:text-white/40 transition-colors">
            PDF · TXT · Text
          </span>

          {/* Plus badge */}
          <div
            className="
            absolute top-3 right-3
            w-6 h-6 rounded-full
            bg-white/10 group-hover:bg-white/20
            flex items-center justify-center
            transition-colors
          "
          >
            <span className="text-white/60 text-sm leading-none">+</span>
          </div>
        </div>

        <p className="mt-2 text-sm font-medium text-white/50 group-hover:text-white/80 transition-colors text-center">
          Upload
        </p>
      </li>
    </Link>
  )
}

export default UploadBookButton
