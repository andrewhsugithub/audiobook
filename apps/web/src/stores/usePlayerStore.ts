import { create } from 'zustand'

export interface TrackInfo {
  bookId: string
  title: string
  author: string
  uploader: string
  src: string
}

interface PlayerState {
  track: TrackInfo | null
  isPlaying: boolean

  play: (track: TrackInfo) => void
  pause: () => void
  resume: () => void
  stop: () => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  track: null,
  isPlaying: false,

  play: (track) => set({ track, isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),
  stop: () => set({ track: null, isPlaying: false }),
}))
