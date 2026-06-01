import { describe, it, expect, beforeEach } from 'vitest'
import { addToMyBooks, getMyBooks, isInMyBooks, type MyBook } from './myBooks'

const book: MyBook = {
  id: '1',
  title: 'The Old Man and the Sea',
  author: 'Hemingway',
  coverUrl: 'cover.jpg',
  ratings: 4,
  description: 'A novella.',
}

describe('myBooks', () => {
  beforeEach(() => localStorage.clear())

  it('starts empty', () => {
    expect(getMyBooks()).toEqual([])
    expect(isInMyBooks('1')).toBe(false)
  })

  it('adds a book and reports membership', () => {
    addToMyBooks(book)
    expect(getMyBooks()).toHaveLength(1)
    expect(isInMyBooks('1')).toBe(true)
  })

  it('does not add duplicates', () => {
    addToMyBooks(book)
    addToMyBooks(book)
    expect(getMyBooks()).toHaveLength(1)
  })

  it('returns an empty array when storage is malformed', () => {
    localStorage.setItem('myBooks', 'not-json')
    expect(getMyBooks()).toEqual([])
  })
})
