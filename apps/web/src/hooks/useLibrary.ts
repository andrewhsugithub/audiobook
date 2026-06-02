import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_BASE_URL as BASE_URL } from '../utils/api'

export interface LibraryBook {
  id: string
  title: string
  author: string | null
  description: string | null
  ratings: number | null
  coverUrl: string
  status: string
  visibility: 'public' | 'private'
  savedAt: string
}

async function fetchLibrary(): Promise<{ results: LibraryBook[] }> {
  const res = await fetch(`${BASE_URL}/library`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch library')
  return res.json()
}

async function saveToLibrary(bookId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/library/${bookId}`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to save book')
  }
}

async function removeFromLibrary(bookId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/library/${bookId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to remove book')
}

async function checkInLibrary(bookId: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/library/check/${bookId}`, {
    credentials: 'include',
  })
  if (!res.ok) return false
  const data = await res.json()
  return data.saved
}

export function useLibrary(isLoggedIn: boolean) {
  return useQuery({
    queryKey: ['user-library'],
    queryFn: fetchLibrary,
    staleTime: 1000 * 60 * 15, // 15m — library contents don't change often
    enabled: isLoggedIn,
  })
}

export function useIsInLibrary(bookId: string, enabled = true) {
  return useQuery({
    queryKey: ['library-check', bookId],
    queryFn: () => checkInLibrary(bookId),
    enabled,
    staleTime: 1000 * 60 * 5,
  })
}

export function useAddToLibrary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveToLibrary,
    onSuccess: (_, bookId) => {
      queryClient.invalidateQueries({ queryKey: ['user-library'] })
      queryClient.invalidateQueries({ queryKey: ['library-check', bookId] })
    },
  })
}

export function useRemoveFromLibrary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: removeFromLibrary,
    onSuccess: (_, bookId) => {
      queryClient.invalidateQueries({ queryKey: ['user-library'] })
      queryClient.invalidateQueries({ queryKey: ['library-check', bookId] })
    },
  })
}
