import { useQuery } from '@tanstack/react-query'

async function initializeStreamSession(bookId: string) {
  const res = await fetch(`http://localhost:8787/audiobook/${bookId}/session`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error(`Session negotiation rejected: ${res.status}`)
  }

  return res.json()
}

export function useHlsStream(bookId: string) {
  return useQuery({
    queryKey: ['hls-session', bookId],
    queryFn: () => initializeStreamSession(bookId),
    // Prevent excessive background network requests while listening
    staleTime: 1000 * 60 * 5, // 5 min
    retry: 1,
  })
}
