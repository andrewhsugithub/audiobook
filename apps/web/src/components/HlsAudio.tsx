import '@videojs/react/audio/skin.css'

import { createPlayer } from '@videojs/react'
import { audioFeatures, AudioSkin, Audio } from '@videojs/react/audio'
import { HlsVideo } from '@videojs/react/media/hls-video'

const Player = createPlayer({ features: audioFeatures })

interface HlsAudioPlayerProps {
  src: string
  title?: string
}

export function HlsAudioPlayer({ src, title }: HlsAudioPlayerProps) {
  return (
    <div className="hls-audio-player">
      {title && <p className="stream-title">{title}</p>}
      <Player.Provider>
        <AudioSkin>
          {/* <Audio src={src} /> */}
          <HlsVideo
            src={src}
            playsInline
            type="application/x-mpegURL"
            crossOrigin="use-credentials"
          />
        </AudioSkin>
      </Player.Provider>
    </div>
  )
}
