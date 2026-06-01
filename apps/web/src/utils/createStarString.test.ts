import { describe, it, expect } from 'vitest'
import { createStarString } from './createStarString'

describe('createStarString', () => {
  it('renders full and empty stars', () => {
    expect(createStarString(3)).toBe('★★★☆☆')
  })

  it('renders a half star', () => {
    expect(createStarString(3.5)).toBe('★★★½☆')
  })

  it('renders all empty for zero', () => {
    expect(createStarString(0)).toBe('☆☆☆☆☆')
  })

  it('renders all full for five', () => {
    expect(createStarString(5)).toBe('★★★★★')
  })
})
