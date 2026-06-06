import { useEffect, useState } from 'react'
import { FaMoon, FaSun } from 'react-icons/fa'

type ThemeMode = 'light' | 'dark'

export default function ThemeToggle() {
  // Initialize state immediately from localStorage/OS preference to avoid hydration mismatches
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('theme')
      if (stored === 'light' || stored === 'dark') return stored
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }
    return 'light'
  })

  // Keep localStorage and raw element attributes perfectly synchronized
  useEffect(() => {
    window.localStorage.setItem('theme', theme)

    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
    document.documentElement.style.colorScheme = theme
  }, [theme])

  const isDark = theme === 'dark'

  return (
    <label className="toggle text-base-content">
      <input
        type="checkbox"
        value="dark"
        className="theme-controller"
        checked={isDark}
        onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
        aria-label="Toggle theme mode"
      />
      <FaSun />
      <FaMoon />
    </label>
  )
}
