type Props = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  pageSizeOptions?: number[]
  disabled?: boolean
}

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  disabled = false,
}: Props) {
  // Build the page number list with ellipsis markers
  // Everything else collapses to '...'
  function getPageNumbers(): (number | '...')[] {
    if (totalPages <= 3) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    const pages: (number | '...')[] = []
    const left = Math.max(2, page - 1)
    const right = Math.min(totalPages - 1, page + 1)

    pages.push(1)

    if (left > 2) pages.push('...')

    for (let i = left; i <= right; i++) pages.push(i)

    if (right < totalPages - 1) pages.push('...')

    pages.push(totalPages)

    return pages
  }

  const pageNumbers = getPageNumbers()

  return (
    <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
      {/* Page size selector */}
      <div className="flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
        <span>Rows per page</span>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value))
          }}
          disabled={disabled}
          className="select select-bordered select-sm w-20"
        >
          {pageSizeOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Page buttons */}
      <div className="join">
        {/* Prev arrow */}
        <button
          className="join-item btn btn-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
          aria-label="Previous page"
        >
          « Prev
        </button>

        {pageNumbers.map((p, i) =>
          p === '...' ? (
            <button
              key={`ellipsis-${i}`}
              className="join-item btn btn-sm btn-disabled"
              disabled
            >
              …
            </button>
          ) : (
            <button
              key={p}
              className={`join-item btn btn-sm ${p === page ? 'btn-active' : ''}`}
              onClick={() => onPageChange(p)}
              disabled={disabled}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          ),
        )}

        {/* Next arrow */}
        <button
          className="join-item btn btn-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
          aria-label="Next page"
        >
          Next »
        </button>
      </div>
    </div>
  )
}
