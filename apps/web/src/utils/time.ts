export function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds || 0))
  const hrs = Math.floor(total / 3600)
  const min = Math.floor((total % 3600) / 60)
  const sec = total % 60

  const mm = min.toString().padStart(2, '0')
  const ss = sec.toString().padStart(2, '0')

  // Audiobooks routinely run for hours, so show H:MM:SS past the hour mark.
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${min}:${ss}`
}
