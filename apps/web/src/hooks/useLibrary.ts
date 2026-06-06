import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_BASE_URL as BASE_URL } from '../utils/api'
import type { SortKey, AudiobookSummary } from '../utils/queries'

type VisibilityFilter = 'all' | 'public' | 'private'
type ScopeFilter = 'saved' | 'uploaded'

export interface UseLibrarySearchOpts {
  q: string
  limit: number
  offset: number
  sort: SortKey
  visibility: VisibilityFilter
  scope: ScopeFilter
  enabled: boolean
}

interface LibrarySearchResult {
  results: AudiobookSummary[]
  total: number
}

export function useLibrarySearch(opts: UseLibrarySearchOpts) {
  const { q, limit, offset, sort, visibility, scope, enabled } = opts

  return useQuery<LibrarySearchResult>({
    queryKey: ['library-search', scope, q, limit, offset, sort, visibility],
    queryFn: async () => {
      const params = new URLSearchParams({
        q,
        limit: String(limit),
        offset: String(offset),
        sort,
        visibility,
        scope,
      })
      const res = await fetch(`${BASE_URL}/library?${params.toString()}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Library fetch failed')
      return res.json()
    },
    enabled,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
}

export function useLibrary(isLoggedIn: boolean) {
  return useQuery({
    queryKey: ['user-library'],
    queryFn: async () => {
      const res = await fetch(
        `${BASE_URL}/library?limit=50&offset=0&scope=saved`,
        { credentials: 'include' },
      )
      if (!res.ok) throw new Error('Failed to fetch library')
      return res.json()
    },
    staleTime: 1000 * 60 * 15,
    enabled: isLoggedIn,
  })
}

export function useIsInLibrary(bookId: string, enabled = true) {
  return useQuery({
    queryKey: ['library-check', bookId],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/library/check/${bookId}`, {
        credentials: 'include',
      })
      if (!res.ok) return false
      const data = await res.json()
      return data.saved
    },
    enabled,
    staleTime: 1000 * 60 * 5,
  })
}

export function useAddToLibrary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (bookId: string) => {
      const res = await fetch(`${BASE_URL}/library/${bookId}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save book')
      }
    },
    // Fire before the request — update the cache instantly
    onMutate: async (bookId) => {
      // Cancel any in-flight refetches so they don't overwrite our optimistic value
      await queryClient.cancelQueries({ queryKey: ['library-check', bookId] })

      // Snapshot the current value so we can roll back on error
      const previous = queryClient.getQueryData<boolean>([
        'library-check',
        bookId,
      ])

      // Optimistically set to true immediately
      queryClient.setQueryData(['library-check', bookId], true)

      return { previous, bookId }
    },
    onError: (_err, bookId, context) => {
      // Roll back to the snapshot on failure
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['library-check', bookId], context.previous)
      }
    },
    onSettled: (_, __, bookId) => {
      // Always sync with server truth after success or failure
      queryClient.invalidateQueries({ queryKey: ['library-check', bookId] })
      queryClient.invalidateQueries({ queryKey: ['user-library'] })
      queryClient.invalidateQueries({ queryKey: ['library-search'] })
    },
  })
}

export function useRemoveFromLibrary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (bookId: string) => {
      const res = await fetch(`${BASE_URL}/library/${bookId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to remove book')
    },
    onMutate: async (bookId) => {
      await queryClient.cancelQueries({ queryKey: ['library-check', bookId] })

      const previous = queryClient.getQueryData<boolean>([
        'library-check',
        bookId,
      ])

      // Optimistically set to false immediately
      queryClient.setQueryData(['library-check', bookId], false)

      return { previous, bookId }
    },
    onError: (_err, bookId, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['library-check', bookId], context.previous)
      }
    },
    onSettled: (_, __, bookId) => {
      queryClient.invalidateQueries({ queryKey: ['library-check', bookId] })
      queryClient.invalidateQueries({ queryKey: ['user-library'] })
      queryClient.invalidateQueries({ queryKey: ['library-search'] })
    },
  })
}
