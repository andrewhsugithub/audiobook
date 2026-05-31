import { useQuery, useQueryClient } from '@tanstack/react-query'

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'

async function initializeStreamSession(bookId: string) {
  const res = await fetch(`${API_URL}/audiobook/${bookId}/session`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as any).error ?? `Session negotiation rejected: ${res.status}`,
    )
  }

  return res.json() as Promise<{
    ok: boolean
    expiresIn: number
    expiresAt: string
    refreshAt: string
  }>
}

async function refreshStreamSession(bookId: string) {
  const res = await fetch(`${API_URL}/audiobook/${bookId}/refresh`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as any).error ?? `Session refresh rejected: ${res.status}`,
    )
  }

  return res.json() as Promise<{
    ok: boolean
    expiresIn: number
    expiresAt: string
    refreshAt: string
  }>
}

interface UseHlsStreamOptions {
  // Only attempt session when book is confirmed ready
  enabled: boolean
}

export function useHlsStream(bookId: string, options: UseHlsStreamOptions) {
  const queryClient = useQueryClient()
  const queryKey = ['hls-session', bookId]

  return useQuery({
    queryKey,
    enabled: options.enabled,
    queryFn: async () => {
      const existing = queryClient.getQueryData<{ refreshAt: string }>(queryKey)

      if (existing) {
        try {
          console.log('[session] Refreshing sliding window token...')
          return await refreshStreamSession(bookId)
        } catch (err) {
          console.warn('[session] Refresh failed, re-initializing...', err)
          return await initializeStreamSession(bookId)
        }
      }

      console.log('[session] Initializing new stream session...')
      return await initializeStreamSession(bookId)
    },
    staleTime: 1000 * 60 * 5,
    retry: 1, // retry once on failure before showing error
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data?.refreshAt) return false

      const timeUntilRefresh = new Date(data.refreshAt).getTime() - Date.now()

      // Refresh at the scheduled time, or in 1s if already past
      return timeUntilRefresh > 0 ? timeUntilRefresh : 1000
    },
    refetchIntervalInBackground: true,
  })
}
