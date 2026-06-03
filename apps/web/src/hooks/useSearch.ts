import { useQuery } from '@tanstack/react-query'
import { searchQuery } from '../utils/queries'
import type { SortKey } from '../utils/queries'
import { useDeferredValue } from 'react'

export function useSearch(
  rawQuery: string,
  limit = 50,
  offset = 0,
  sort: SortKey = 'recent',
) {
  // Debounce via useDeferredValue — no setTimeout needed
  const query = useDeferredValue(rawQuery)

  const result = useQuery(searchQuery(query, limit, offset, sort))

  return {
    ...result,
    isStale: query !== rawQuery, // true while user is still typing
  }
}
