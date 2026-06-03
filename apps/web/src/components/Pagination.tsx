import { FaChevronDown, FaChevronLeft, FaChevronRight } from 'react-icons/fa'

type Props = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  pageSizeOptions?: number[]
  disabled?: boolean
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50]

// Build a compact page list with ellipses, e.g. 1 … 4 5 6 … 20
function pageItems(page: number, total: number): Array<number | 'gap'> {
  const items: Array<number | 'gap'> = []
  for (let p = 1; p <= total; p++) {
    const inWindow = p === 1 || p === total || Math.abs(p - page) <= 1
    if (inWindow) {
      items.push(p)
    } else if (items[items.length - 1] !== 'gap') {
      items.push('gap')
    }
  }
  return items
}

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  disabled = false,
}: Props) {
  const canPrev = page > 1 && !disabled
  const canNext = page < totalPages && !disabled

  const navBtn = 'btn btn-sm btn-square btn-ghost'

  return (
    <div className="mt-10 flex flex-col-reverse items-center justify-between gap-4 sm:flex-row">
      {/* Page-size selector */}
      <label className="flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
        <span>Per page</span>
        <span className="relative">
          <select
            aria-label="Books per page"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-9 cursor-pointer appearance-none rounded-xl border border-[var(--chip-line)] bg-[var(--chip-bg)] pr-8 pl-3 text-sm font-medium text-[var(--sea-ink)] outline-none transition-all duration-200 hover:border-[var(--lagoon)] focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[var(--lagoon)]/20"
          >
            {pageSizeOptions.map((n) => (
              <option
                key={n}
                value={n}
                className="bg-[var(--chip-bg)] text-[var(--sea-ink)]"
              >
                {n}
              </option>
            ))}
          </select>
          <FaChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] opacity-50"
          />
        </span>
      </label>

      {/* Page navigation — only meaningful when there's more than one page */}
      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={!canPrev}
            className={navBtn}
            aria-label="Previous page"
          >
            <FaChevronLeft className="text-xs" />
          </button>

          {pageItems(page, totalPages).map((item, i) =>
            item === 'gap' ? (
              <span
                key={`gap-${i}`}
                className="px-1 text-sm text-[var(--sea-ink-soft)] opacity-60"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                disabled={disabled}
                aria-label={`Page ${item}`}
                aria-current={item === page ? 'page' : undefined}
                className={
                  item === page ? 'btn btn-sm btn-square btn-primary' : navBtn
                }
              >
                {item}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={!canNext}
            className={navBtn}
            aria-label="Next page"
          >
            <FaChevronRight className="text-xs" />
          </button>
        </nav>
      )}
    </div>
  )
}
