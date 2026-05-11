import { useQueryClient, useQuery } from '@tanstack/react-query'

const BASE_URL = 'https://library-api.uidotdev.workers.dev'

export async function getBook(bookId: string) {
  const url = `${BASE_URL}/books/${bookId}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Unable fetch book details')
  }

  const data = await response.json()
  return data
}

export async function getMyBooks() {
  const url = `${BASE_URL}/books/my-books`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Unable fetch your checked out books')
  }

  const data = await response.json()
  return data
}

export async function getFeaturedBooks() {
  const url = `${BASE_URL}/books/featured`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Unable fetch featured books')
  }

  const data = await response.json()
  return data
}

export const bookQueries = {
  all: () => ({
    queryKey: ['books'],
  }),
  detail: (bookId: string) => ({
    queryKey: ['books', bookId],
    queryFn: () => getBook(bookId),
    staleTime: Infinity,
  }),
  featured: () => ({
    queryKey: ['books', 'featured'],
    queryFn: getFeaturedBooks,
    staleTime: Infinity,
  }),
  myBooks: () => ({
    queryKey: ['books', 'my-books'],
    queryFn: getMyBooks,
  }),
  // search: (query: string, page: number) => ({
  //   queryKey: ['books', 'search', query, page],
  //   queryFn: () => getBookSearchResult(query, page),
  //   enabled: Boolean(query),
  //   placeholderData: (previousData) => previousData,
  // }),
}

export function useBookQuery(bookId: string) {
  const queryClient = useQueryClient()
  return useQuery({
    ...bookQueries.detail(bookId),
    initialData: () => {
      return queryClient
        .getQueryData(bookQueries.featured().queryKey)
        ?.find((book: any) => book.id === bookId)
    },
  })
}

export function usePrefetchBookById(bookId: string) {
  const queryClient = useQueryClient()
  const prefetch = () => {
    queryClient.prefetchQuery(bookQueries.detail(bookId))
  }

  return { prefetch }
}

export function useFeaturedBooks() {
  return useQuery(bookQueries.featured())
}

export function useMyBooks() {
  return useQuery(bookQueries.myBooks())
}

// export function useSearchQuery(query: string, page: number) {
//   return useQuery(bookQueries.search(query, page))
// }
