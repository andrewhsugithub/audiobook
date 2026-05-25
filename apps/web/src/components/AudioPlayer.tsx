import { useEffect, useState } from 'react'
import { FaPlay, FaPause, FaRedo } from 'react-icons/fa'
import { formatTime } from '../utils/time'

type Props = {
  duration?: number
  initialTime?: number
}

export default function AudioPlayer({
  duration = 240,
  initialTime = 0,
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(initialTime)

  const progress = (currentTime / duration) * 100
  const isFinished = currentTime >= duration

  useEffect(() => {
    if (!isPlaying) return

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= duration) {
          setIsPlaying(false)
          return duration
        }

        return prev + 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isPlaying, duration])

  return (
    <div className="mt-8 max-w-xl">
      <div className="flex items-center gap-4">
        <button
          onClick={() => {
            if (isFinished) {
              setCurrentTime(0)
              setIsPlaying(true)
              return
            }

            setIsPlaying(!isPlaying)
          }}
          className="text-2xl text-[var(--sea-ink)] transition-all duration-300 hover:scale-110"
        >
          {isFinished ? <FaRedo /> : isPlaying ? <FaPause /> : <FaPlay />}
        </button>

        <div className="flex-1">
          <input
            type="range"
            min="0"
            max={duration}
            value={currentTime}
            onChange={(e) => setCurrentTime(Number(e.target.value))}
            className="w-full accent-[var(--lagoon)]"
            style={{
              background: `linear-gradient(to right, var(--lagoon) ${progress}%, rgba(0,0,0,0.12) ${progress}%)`,
            }}
          />

          <div className="mt-1 flex justify-between text-sm text-[var(--sea-ink-soft)]">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
