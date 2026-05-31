import { useQuery } from '@tanstack/react-query'

async function fetchAudiobookInfo(bookId: string) {
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/audiobook/${bookId}/info`,
  )

  if (!res.ok) {
    if (res.status === 404) throw new Error('Audiobook details not found')
    throw new Error('Failed to retrieve audiobook metadata')
  }

  return res.json() as Promise<{
    id: string
    status: string
    title: string
    author: string
    description: string
    ratings: number | null
    coverUrl: string
    isReady: boolean
    errorMessage: string | null
  }>
}

export function useAudiobookInfo(bookId: string) {
  return useQuery({
    queryKey: ['audiobook-info', bookId],
    queryFn: () => fetchAudiobookInfo(bookId),
    staleTime: 1000 * 60 * 15, // Book descriptions rarely change, cache for 15 mins
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return false
      if (status === 'completed' || status === 'failed') return false
      return 30000 // Poll every 30 seconds if the book is still processing
    },
  })
}
