/**
 * "My Books" personal library, persisted in localStorage.
 *
 * Centralizes reads/writes so the shape is consistent everywhere (previously
 * `localStorage.getItem('myBooks')` was parsed ad hoc in several places with
 * mismatched `coverUrl` vs `coverURL` keys).
 *
 * TODO: move to backend persistence so a library follows the user across
 * devices.
 */

export interface MyBook {
  id: string
  title: string
  author: string
  coverUrl: string
  ratings: number
  description: string
}

const STORAGE_KEY = 'myBooks'

export function getMyBooks(): MyBook[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as MyBook[]) : []
  } catch {
    return []
  }
}

export function isInMyBooks(bookId: string): boolean {
  return getMyBooks().some((b) => String(b.id) === String(bookId))
}

export function addToMyBooks(book: MyBook): void {
  const books = getMyBooks()
  if (books.some((b) => String(b.id) === String(book.id))) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...books, book]))
}
