import { queryOptions } from '@tanstack/react-query'
import { API_BASE_URL as API_URL } from './api'

export interface AudiobookSummary {
  id: string
  title: string
  author: string | null
  description: string | null
  ratings: number | null
  coverUrl: string
  status: string
  visibility: 'public' | 'private'
  isOwner: boolean
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
  version: string
  isOwner: boolean
  coverUrl: string
  isReady: boolean
  errorMessage: string | null
}

export interface AudiobookUploader {
  id: string
  name: string
  image: string | null
}

export interface UserProfile {
  id: string
  name: string
  image: string | null
}

export interface SearchQueryOptions {
  q?: string
  limit?: number
  offset?: number
  sort?: SortKey
  completeOnly?: boolean
  userId?: string
  uploadedByMe?: boolean
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

export function searchQuery(opts: SearchQueryOptions | string, limit = 10) {
  const normalized: SearchQueryOptions =
    typeof opts === 'string' ? { q: opts, limit } : opts

  const {
    q = '',
    limit: lim = 10,
    offset = 0,
    sort = 'recent',
    completeOnly = false,
    userId,
    uploadedByMe = false,
  } = normalized

  const params = new URLSearchParams()
  if (q) params.set('q', q)
  params.set('limit', String(lim))
  params.set('offset', String(offset))
  params.set('sort', sort)

  if (completeOnly) params.set('completeOnly', 'true')
  if (uploadedByMe) params.set('uploadedByMe', 'true')

  if (userId && userId !== 'undefined') {
    params.set('userId', userId)
  }

  return {
    queryKey: [
      'audiobook-search',
      q,
      lim,
      offset,
      sort,
      completeOnly,
      userId,
      uploadedByMe,
    ],
    queryFn: async (): Promise<SearchResponse> => {
      const res = await fetch(
        `${API_URL}/audiobook/search?${params.toString()}`,
        {
          credentials: 'include',
        },
      )

      if (!res.ok) {
        throw new Error(
          `Server returned status code ${res.status} on search lookup matrix.`,
        )
      }

      const contentType = res.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(
          'Received non-JSON content wrapper from storage backend query gateway.',
        )
      }

      return res.json()
    },
    staleTime: 1000 * 15,
    placeholderData: (prev: any) => prev,
  }
}

export const audiobookInfoQuery = (bookId: string) =>
  queryOptions({
    queryKey: ['audiobook-info', bookId],
    queryFn: () => fetchAudiobookInfo(bookId),
    staleTime: 1000 * 60 * 15, // 15m — audiobook details don't change often
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status !== 'processing') return false
      return 10000 // 30s — if still processing, check for updates every minute
    },
  })

async function fetchAudiobookUploader(
  bookId: string,
): Promise<{ uploader: AudiobookUploader | null }> {
  const res = await fetch(`${API_URL}/audiobook/${bookId}/uploader`, {
    credentials: 'include',
  })
  if (!res.ok) {
    if (res.status === 404) throw new Error('Audiobook not found')
    throw new Error('Failed to load uploader')
  }
  return res.json()
}

export const audiobookUploaderQuery = (bookId: string) =>
  queryOptions({
    queryKey: ['audiobook-uploader', bookId],
    queryFn: () => fetchAudiobookUploader(bookId),
    staleTime: 1000 * 60 * 15, // 15m — uploader doesn't change
  })

async function fetchUserProfile(
  userId: string,
): Promise<{ user: UserProfile }> {
  const res = await fetch(`${API_URL}/audiobook/user/${userId}`, {
    credentials: 'include',
  })
  if (!res.ok) {
    if (res.status === 404) throw new Error('User not found')
    throw new Error('Failed to load user')
  }
  return res.json()
}

export const userProfileQuery = (userId: string) =>
  queryOptions({
    queryKey: ['user-profile', userId],
    queryFn: () => fetchUserProfile(userId),
    staleTime: 1000 * 60 * 15, // 15m — profile rarely changes
  })
