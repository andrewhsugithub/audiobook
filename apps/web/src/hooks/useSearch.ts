import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { searchQuery } from '../utils/queries'
import type { SearchQueryOptions, SearchResponse } from '../utils/queries'
import { useDeferredValue } from 'react'
import { API_BASE_URL as API_URL } from '../utils/api'

export function useSearch(opts: SearchQueryOptions | string) {
  // Gracefully pull query value string target depending on standard payload structural formats
  const currentQueryString = typeof opts === 'string' ? opts : (opts?.q ?? '')
  const debouncedQuery = useDeferredValue(currentQueryString)

  // Ensure options argument maps as a configured structural definition block
  const searchOptions = typeof opts === 'string' ? { q: opts } : opts
  const queryConfig = searchQuery(searchOptions)

  const result = useQuery(queryConfig)

  return {
    ...result,
    // Safely evaluate stale evaluation typing calculations during high rate keyboard inputs
    isStale: debouncedQuery !== currentQueryString,
  }
}

export function useInfiniteSearch(opts: Omit<SearchQueryOptions, 'offset'>) {
  const {
    q = '',
    limit = 10,
    sort = 'recent',
    completeOnly,
    userId,
    uploadedByMe,
  } = opts

  return useInfiniteQuery<SearchResponse>({
    queryKey: [
      'audiobook-search-infinite',
      q,
      limit,
      sort,
      completeOnly,
      userId,
      uploadedByMe,
    ],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      params.set('limit', String(limit))
      params.set('offset', String(pageParam))
      params.set('sort', sort)
      if (completeOnly) params.set('completeOnly', 'true')
      if (uploadedByMe) params.set('uploadedByMe', 'true')
      if (userId) params.set('userId', userId)

      const res = await fetch(
        `${API_URL}/audiobook/search?${params.toString()}`,
        { credentials: 'include' },
      )
      if (!res.ok) throw new Error('Search failed')
      return res.json()
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const currentOffset = allPages.length * limit
      return currentOffset < lastPage.total ? currentOffset : undefined
    },
    staleTime: 1000 * 15,
  })
}
