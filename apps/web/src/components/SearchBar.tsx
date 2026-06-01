import { FaSearch } from 'react-icons/fa'

type Props = {
  value: string
  onChange: (value: string) => void
}

export default function SearchBar({ value, onChange }: Props) {
  return (
    <div className="relative z-10 hidden sm:block">
      <label htmlFor="search" className="sr-only">
        Search audiobooks
      </label>
      <FaSearch
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-sm opacity-50"
      />
      <input
        className="h-8 w-22 sm:w-32 md:w-42 lg:w-52 rounded-xl border border-[var(--chip-line)] bg-[var(--chip-bg)] pl-10 pr-4 text-sm text-[var(--sea-ink)] outline-none transition-all duration-300 focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[var(--lagoon)]/20"
        type="search"
        name="search"
        id="search"
        placeholder="Search"
        aria-label="Search audiobooks"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  )
}
