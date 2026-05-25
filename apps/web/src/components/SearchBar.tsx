import { FaSearch } from 'react-icons/fa'

type Props = {
  value: string
  onChange: (value: string) => void
}

export default function SearchBar({ value, onChange }: Props) {
  return (
    <div className="relative z-10 hidden sm:block">
      <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-sm opacity-50" />
      <input
        className="h-8 w-22 sm:w-32 md:w-42 lg:w-52 rounded-xl border border-white/10 bg-(--panel-bg) pl-10 pr-4 text-sm text-(--body-text) outline-none transition-all duration-300 focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[var(--lagoon)]/20"
        type="text"
        name="search"
        id="search"
        placeholder="Search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  )
}
