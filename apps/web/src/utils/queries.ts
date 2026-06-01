import { queryOptions } from '@tanstack/react-query'
import { API_BASE_URL as API_URL } from './api'

export interface AudiobookSummary {
  id: string
  title: string
  author: string
  description: string
  ratings: number | null
  coverUrl: string
  status: string
}

export interface SearchResponse {
  results: AudiobookSummary[]
  total: number
  query: string
  limit: number
  offset: number
}

export interface AudiobookInfo {
  id: string
  status: string
  title: string
  author: string
  description: string
  ratings: number | null
  coverUrl: string
  isReady: boolean
  errorMessage: string | null
}

async function searchAudiobooks(
  query: string,
  limit = 50,
  offset = 0,
  completeOnly = false,
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    offset: String(offset),
    completeOnly: String(completeOnly),
  })
  const res = await fetch(`${API_URL}/audiobook/search?${params}`)
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

async function fetchAudiobookInfo(bookId: string): Promise<AudiobookInfo> {
  const res = await fetch(`${API_URL}/audiobook/${bookId}/info`)
  if (!res.ok) {
    if (res.status === 404) throw new Error('Audiobook not found')
    throw new Error('Failed to load audiobook')
  }
  return res.json()
}

export const searchQuery = (query: string, limit = 50) =>
  queryOptions({
    queryKey: ['audiobook-search', query, limit],
    queryFn: () => searchAudiobooks(query, limit),
    staleTime: 1000 * 30, // 30s — search results can change
    placeholderData: (prev) => prev, // keep previous results while fetching
  })

export const audiobookInfoQuery = (bookId: string) =>
  queryOptions({
    queryKey: ['audiobook-info', bookId],
    queryFn: () => fetchAudiobookInfo(bookId),
    staleTime: 1000 * 60 * 15,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status || status === 'completed' || status === 'failed') return false
      return 5000
    },
  })
