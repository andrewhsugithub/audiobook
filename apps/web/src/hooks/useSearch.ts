import { useQuery } from '@tanstack/react-query'
import { searchQuery } from '../utils/queries'
import { useDeferredValue } from 'react'

export function useSearch(rawQuery: string, limit = 50) {
  // Debounce via useDeferredValue — no setTimeout needed
  const query = useDeferredValue(rawQuery)

  const result = useQuery(searchQuery(query, limit))

  return {
    ...result,
    isStale: query !== rawQuery, // true while user is still typing
  }
}
