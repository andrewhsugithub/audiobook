import '@videojs/react/audio/skin.css'

import { Link } from '@tanstack/react-router'
import { createPlayer } from '@videojs/react'
import { audioFeatures, AudioSkin } from '@videojs/react/audio'
import { HlsVideo } from '@videojs/react/media/hls-video'
import { X } from 'lucide-react'
import { ErrorBoundary } from './ErrorBoundary'
import { usePlayerStore } from '../stores/usePlayerStore'

const Player = createPlayer({ features: audioFeatures })

export function GlobalAudioPlayer() {
  const { track, stop } = usePlayerStore()

  // Don't render anything when nothing is playing
  if (!track) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--line)] bg-[var(--surface)] shadow-2xl backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-4 py-3">
        {/* Track info row */}
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3">
            <div className="min-w-0">
              <Link
                to="/books/$bookId"
                params={{ bookId: track.bookId }}
                className="block truncate text-sm font-semibold text-[var(--sea-ink)] hover:underline"
              >
                {track.title}
              </Link>
              <p className="text-xs text-[var(--sea-ink-soft)]">Now Playing</p>
            </div>
          </div>

          <button
            type="button"
            onClick={stop}
            aria-label="Close player"
            className="btn btn-ghost btn-sm btn-circle shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Player — always mounted while track is set */}
        <ErrorBoundary
          fallback={
            <p className="text-sm text-error py-2">
              Player error.{' '}
              <button onClick={stop} className="underline">
                Dismiss
              </button>
            </p>
          }
        >
          <Player.Provider>
            <AudioSkin>
              <HlsVideo
                src={track.src}
                title={track.title}
                playsInline
                autoPlay
                type="application/x-mpegURL"
                crossOrigin="use-credentials"
              />
            </AudioSkin>
          </Player.Provider>
        </ErrorBoundary>
      </div>
    </div>
  )
}
