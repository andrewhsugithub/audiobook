import { FaChevronDown, FaSortAmountDown } from 'react-icons/fa'
import type { SortKey } from '../utils/queries'

type Props = {
  value: SortKey
  onChange: (value: SortKey) => void
}

const OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'title-asc', label: 'Title (A–Z)' },
  { value: 'title-desc', label: 'Title (Z–A)' },
  { value: 'author-asc', label: 'Author (A–Z)' },
  { value: 'rating-desc', label: 'Top rated' },
]

export default function SortSelect({ value, onChange }: Props) {
  return (
    <div className="relative">
      <FaSortAmountDown
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs opacity-50"
      />
      <select
        aria-label="Sort books"
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="h-9 cursor-pointer appearance-none rounded-xl border border-[var(--chip-line)] bg-[var(--chip-bg)] pr-9 pl-9 text-sm font-medium text-[var(--sea-ink)] outline-none transition-all duration-300 hover:border-[var(--lagoon)] focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[var(--lagoon)]/20"
      >
        {OPTIONS.map((o) => (
          <option
            key={o.value}
            value={o.value}
            className="bg-[var(--chip-bg)] text-[var(--sea-ink)]"
          >
            {o.label}
          </option>
        ))}
      </select>
      <FaChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] opacity-50"
      />
    </div>
  )
}
