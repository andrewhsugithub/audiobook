import '@videojs/react/audio/skin.css'

import { createPlayer } from '@videojs/react'
import { audioFeatures, AudioSkin } from '@videojs/react/audio'
import { HlsVideo } from '@videojs/react/media/hls-video'
import { ErrorBoundary } from './ErrorBoundary'

const Player = createPlayer({ features: audioFeatures })

interface HlsAudioPlayerProps {
  src: string
  title?: string
}

function PlayerFallback() {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
      ⚠️ The audio player failed to load. Please refresh the page to try again.
    </div>
  )
}

export function HlsAudioPlayer({ src, title }: HlsAudioPlayerProps) {
  if (!src) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm opacity-60">
        No audio stream available yet.
      </div>
    )
  }

  return (
    <div className="hls-audio-player">
      {title && <p className="stream-title">{title}</p>}
      <ErrorBoundary fallback={<PlayerFallback />}>
        <Player.Provider>
          <AudioSkin>
            <HlsVideo
              src={src}
              playsInline
              type="application/x-mpegURL"
              crossOrigin="use-credentials"
            />
          </AudioSkin>
        </Player.Provider>
      </ErrorBoundary>
    </div>
  )
}
