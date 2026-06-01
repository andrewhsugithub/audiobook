import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMultipartUpload } from '../hooks/useMultipartUpload'

interface Props {
  userId: string
  // If provided, this is a reupload for an existing book
  existingBookId?: string
  existingTitle?: string
}

const STATUS_LABELS: Record<string, string> = {
  idle: '',
  initiating: 'Preparing upload...',
  uploading: 'Uploading...',
  completing: 'Finalising...',
  done: 'Upload complete!',
  error: 'Upload failed',
}

export function UploadForm({ userId, existingBookId, existingTitle }: Props) {
  const navigate = useNavigate()
  const { state, upload, uploadText, abort, reset } = useMultipartUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState(existingTitle ?? '')
  const [author, setAuthor] = useState('')
  const [textContent, setTextContent] = useState('')
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file')

  const isReupload = !!existingBookId
  const isActive = ['initiating', 'uploading', 'completing'].includes(
    state.status,
  )

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const file = fileInputRef.current?.files?.[0]
    if (!file) return

    try {
      const bookId = await upload(file, {
        userId,
        title,
        author,
        existingBookId,
      })

      if (!isReupload) {
        navigate({ to: '/books/$bookId', params: { bookId } })
      }
    } catch {
      // error layout gracefully managed via internal hook states
    }
  }

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!textContent.trim()) return

    try {
      const bookId = await uploadText(textContent, {
        userId,
        title,
        author,
        existingBookId,
      })

      if (!isReupload) {
        navigate({ to: '/books/$bookId', params: { bookId } })
      }
    } catch {
      // error layout gracefully managed via internal hook states
    }
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h2 className="text-xl font-semibold mb-4">
        {isReupload
          ? `Replace file for "${existingTitle}"`
          : 'Upload Audiobook'}
      </h2>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-6">
        {(['file', 'text'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm capitalize transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-white text-white'
                : 'opacity-50 hover:opacity-75'
            }`}
          >
            {tab === 'file' ? 'PDF / TXT File' : 'Paste Text'}
          </button>
        ))}
      </div>

      {/* Metadata — shared across tabs, hidden on reupload */}
      {!isReupload && (
        <div className="space-y-3 mb-6">
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm"
          />
          <input
            type="text"
            placeholder="Author (optional)"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm"
          />
        </div>
      )}

      {activeTab === 'file' ? (
        <form onSubmit={handleFileSubmit} className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            disabled={isActive}
            className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-white/10 file:rounded file:cursor-pointer"
          />
          <UploadActions
            isActive={isActive}
            status={state.status}
            progress={state.progress}
            error={state.error}
            onAbort={abort}
            onReset={reset}
          />
        </form>
      ) : (
        <form onSubmit={handleTextSubmit} className="space-y-4">
          <textarea
            placeholder="Paste your book text here..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            rows={10}
            disabled={isActive}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm resize-y font-mono"
          />
          <UploadActions
            isActive={isActive}
            status={state.status}
            progress={state.progress}
            error={state.error}
            onAbort={abort}
            onReset={reset}
          />
        </form>
      )}
    </div>
  )
}

function UploadActions({
  isActive,
  status,
  progress,
  error,
  onAbort,
  onReset,
}: {
  isActive: boolean
  status: string
  progress: number
  error: string | null
  onAbort: () => void
  onReset: () => void
}) {
  return (
    <div className="space-y-3">
      {isActive ? (
        <>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div
              className="bg-white h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="opacity-60 animate-pulse">
              {STATUS_LABELS[status]}
            </span>
            <span className="opacity-60">{progress}%</span>
          </div>
          <button
            type="button"
            onClick={onAbort}
            className="w-full py-2 text-sm border border-red-500/30 text-red-400 rounded hover:bg-red-500/10 transition-colors"
          >
            Cancel Upload
          </button>
        </>
      ) : (
        <>
          {error && (
            <p className="text-sm text-red-400 p-3 bg-red-500/10 rounded border border-red-500/20">
              {error}
              <button
                onClick={onReset}
                className="ml-2 underline opacity-70 hover:opacity-100"
              >
                Try again
              </button>
            </p>
          )}
          {status === 'done' && (
            <p className="text-sm text-green-400">
              ✓ Upload complete — processing started
            </p>
          )}
          {status !== 'done' && (
            <button
              type="submit"
              disabled={isActive}
              className="w-full py-3 rounded-full island-shell font-semibold transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Upload
            </button>
          )}
        </>
      )}
    </div>
  )
}
