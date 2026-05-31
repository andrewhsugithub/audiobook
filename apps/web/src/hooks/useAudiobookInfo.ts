import { useQuery } from '@tanstack/react-query'
import { audiobookInfoQuery } from '../utils/queries'

export function useAudiobookInfo(bookId: string) {
  return useQuery(audiobookInfoQuery(bookId))
}
