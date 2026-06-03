import { useEffect, useState } from 'react'
import { FaMoon, FaSun } from 'react-icons/fa'

type ThemeMode = 'light' | 'dark'

function getInitialMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const stored = window.localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') {
    return stored
  }

  // No explicit choice yet — follow the OS preference.
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyThemeMode(mode: ThemeMode) {
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(mode)
  document.documentElement.setAttribute('data-theme', mode)
  document.documentElement.style.colorScheme = mode
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('light')

  useEffect(() => {
    const initialMode = getInitialMode()
    setMode(initialMode)
    applyThemeMode(initialMode)
  }, [])

  function toggleMode() {
    const nextMode: ThemeMode = mode === 'dark' ? 'light' : 'dark'
    setMode(nextMode)
    applyThemeMode(nextMode)
    window.localStorage.setItem('theme', nextMode)
  }

  const isDark = mode === 'dark'
  const label = `Switch to ${isDark ? 'light' : 'dark'} mode`

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={toggleMode}
      aria-label={label}
      title={label}
      className="relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] transition-colors"
    >
      {/* Sliding knob */}
      <span
        className={`absolute top-1 left-1 grid h-6 w-6 place-content-center rounded-full bg-[var(--lagoon-deep)] text-white shadow-[0_2px_8px_rgba(50,143,151,0.45)] transition-transform duration-300 ease-out ${
          isDark ? 'translate-x-8' : 'translate-x-0'
        }`}
      >
        {isDark ? (
          <FaMoon aria-hidden="true" className="text-[11px]" />
        ) : (
          <FaSun aria-hidden="true" className="text-[11px]" />
        )}
      </span>

      {/* Track icons (the inactive side stays visible behind the knob) */}
      <span className="pointer-events-none relative z-10 flex w-full items-center justify-between px-2 text-[11px] text-[var(--sea-ink-soft)]">
        <FaSun aria-hidden="true" className={isDark ? 'opacity-100' : 'opacity-0'} />
        <FaMoon
          aria-hidden="true"
          className={isDark ? 'opacity-0' : 'opacity-100'}
        />
      </span>
    </button>
  )
}
