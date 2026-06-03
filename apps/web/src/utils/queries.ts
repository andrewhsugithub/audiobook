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

export type SortKey =
  | 'recent'
  | 'title-asc'
  | 'title-desc'
  | 'author-asc'
  | 'rating-desc'

export interface AudiobookInfo {
  id: string
  status: string
  title: string
  author: string
  description: string
  ratings: number | null
  visibility: 'public' | 'private'
  isOwner: boolean
  coverUrl: string
  isReady: boolean
  errorMessage: string | null
}

async function searchAudiobooks(
  query: string,
  limit = 50,
  offset = 0,
  sort: SortKey = 'recent',
  completeOnly = false,
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    offset: String(offset),
    sort,
    completeOnly: String(completeOnly),
  })
  const res = await fetch(`${API_URL}/audiobook/search?${params}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

async function fetchAudiobookInfo(bookId: string): Promise<AudiobookInfo> {
  const res = await fetch(`${API_URL}/audiobook/${bookId}/info`, {
    credentials: 'include',
  })
  if (!res.ok) {
    if (res.status === 404) throw new Error('Audiobook not found')
    throw new Error('Failed to load audiobook')
  }
  return res.json()
}

export const searchQuery = (
  query: string,
  limit = 50,
  offset = 0,
  sort: SortKey = 'recent',
) =>
  queryOptions({
    queryKey: ['audiobook-search', query, limit, offset, sort],
    queryFn: () => searchAudiobooks(query, limit, offset, sort),
    staleTime: 1000 * 30, // 30s — search results can change
    placeholderData: (prev) => prev, // keep previous page visible while fetching
  })

export const audiobookInfoQuery = (bookId: string) =>
  queryOptions({
    queryKey: ['audiobook-info', bookId],
    queryFn: () => fetchAudiobookInfo(bookId),
    staleTime: 1000 * 60 * 15, // 15m — audiobook details don't change often
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status !== 'processing') return false
      return 5000
    },
  })
