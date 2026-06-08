import { useState } from 'react'
import { API_BASE_URL as BASE_URL } from '../utils/api'
import { usePlayerStore } from '../stores/usePlayerStore'

interface UsePlayTrackOpts {
  bookId: string
  title: string
  version: string
  author: string
  uploader: string
}

export function usePlayTrack({
  bookId,
  title,
  version,
  author,
  uploader,
}: UsePlayTrackOpts) {
  const { track, play, stop } = usePlayerStore()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCurrentTrack = track?.bookId === bookId
  const isPlaying = isCurrentTrack

  const handlePlay = async () => {
    if (isCurrentTrack) {
      stop()
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`${BASE_URL}/audiobook/${bookId}/session`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Session error ${res.status}`)
      }

      const data = await res.json()

      play({
        bookId,
        title,
        author,
        uploader,
        src: `${BASE_URL}/audiobook/${bookId}/${version}/master.m3u8`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start stream')
    } finally {
      setIsLoading(false)
    }
  }

  return { handlePlay, isPlaying, isCurrentTrack, isLoading, error }
}
