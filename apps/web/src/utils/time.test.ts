import { describe, it, expect } from 'vitest'
import { formatTime } from './time'

describe('formatTime', () => {
  it('formats seconds under a minute with a zero-padded second', () => {
    expect(formatTime(5)).toBe('0:05')
  })

  it('formats minutes and seconds', () => {
    expect(formatTime(125)).toBe('2:05')
  })

  it('formats durations over an hour as H:MM:SS', () => {
    expect(formatTime(3661)).toBe('1:01:01')
  })

  it('clamps negatives and handles zero', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(-10)).toBe('0:00')
  })
})
