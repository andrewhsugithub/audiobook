import { useQuery } from '@tanstack/react-query'
import { audiobookInfoQuery, audiobookUploaderQuery } from '../utils/queries'

export function useAudiobookInfo(bookId: string) {
  return useQuery(audiobookInfoQuery(bookId))
}

export function useAudiobookUploader(bookId: string) {
  return useQuery(audiobookUploaderQuery(bookId))
}
