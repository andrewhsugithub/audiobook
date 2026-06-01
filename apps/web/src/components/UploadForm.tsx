import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMultipartUpload } from '../hooks/useMultipartUpload'
import type { UploadStatus } from '../hooks/useMultipartUpload'
import { useToast } from './Toast'

interface Props {
  userId: string
  // If provided, this is a reupload for an existing book
  existingBookId?: string
  existingTitle?: string
}

const STATUS_LABELS: Record<UploadStatus, string> = {
  idle: '',
  initiating: 'Preparing upload...',
  uploading: 'Uploading...',
  completing: 'Finalising...',
  done: 'Upload complete!',
  error: 'Upload failed',
}

const ACCEPTED_EXTENSIONS = ['.pdf', '.txt']
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

function validateFile(file: File): string | null {
  const name = file.name.toLowerCase()
  const okType = ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
  if (!okType) {
    return `Unsupported file type. Please upload a ${ACCEPTED_EXTENSIONS.join(' or ')} file.`
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB).`
  }
  return null
}

export function UploadForm({ userId, existingBookId, existingTitle }: Props) {
  const navigate = useNavigate()
  const toast = useToast()
  const { state, upload, uploadText, abort, reset } = useMultipartUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState(existingTitle ?? '')
  const [author, setAuthor] = useState('')
  const [textContent, setTextContent] = useState('')
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const isReupload = !!existingBookId
  const isActive = ['initiating', 'uploading', 'completing'].includes(
    state.status,
  )

  const pickFile = (file: File | null) => {
    setValidationError(null)
    if (!file) {
      setSelectedFile(null)
      return
    }
    const error = validateFile(file)
    if (error) {
      setValidationError(error)
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
  }

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) {
      setValidationError('Please choose a file to upload.')
      return
    }

    try {
      const bookId = await upload(selectedFile, {
        userId,
        title,
        author,
        existingBookId,
      })
      toast.success('Upload complete — processing started.')
      if (!isReupload) {
        navigate({ to: '/books/$bookId', params: { bookId } })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.')
    }
  }

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!textContent.trim()) {
      setValidationError('Please paste some text before uploading.')
      return
    }

    try {
      const bookId = await uploadText(textContent, {
        userId,
        title,
        author,
        existingBookId,
      })
      toast.success('Upload complete — processing started.')
      if (!isReupload) {
        navigate({ to: '/books/$bookId', params: { bookId } })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.')
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (isActive) return
    pickFile(e.dataTransfer.files?.[0] ?? null)
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h2 className="text-xl font-semibold mb-4">
        {isReupload
          ? `Replace file for "${existingTitle}"`
          : 'Upload Audiobook'}
      </h2>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-6" role="tablist">
        {(['file', 'text'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
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
          <div className="space-y-1">
            <label htmlFor="upload-title" className="field-label">
              Title
            </label>
            <input
              id="upload-title"
              type="text"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="field-input"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="upload-author" className="field-label">
              Author (optional)
            </label>
            <input
              id="upload-author"
              type="text"
              placeholder="Author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="field-input"
            />
          </div>
        </div>
      )}

      {validationError && (
        <p
          role="alert"
          className="mb-4 text-sm text-red-400 p-3 bg-red-500/10 rounded border border-red-500/20"
        >
          {validationError}
        </p>
      )}

      {activeTab === 'file' ? (
        <form onSubmit={handleFileSubmit} className="space-y-4">
          <label htmlFor="upload-file" className="field-label">
            Audiobook source file
          </label>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              if (!isActive) setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`rounded-lg border border-dashed p-4 text-sm transition-colors ${
              isDragging
                ? 'border-[var(--lagoon)] bg-[var(--lagoon)]/10'
                : 'border-white/20'
            }`}
          >
            <input
              id="upload-file"
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt"
              disabled={isActive}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-white/10 file:rounded file:cursor-pointer"
            />
            <p className="mt-2 opacity-60">
              {selectedFile
                ? `Selected: ${selectedFile.name}`
                : 'Drag & drop a .pdf or .txt file here, or browse above.'}
            </p>
          </div>
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
          <label htmlFor="upload-text" className="field-label">
            Book text
          </label>
          <textarea
            id="upload-text"
            placeholder="Paste your book text here..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            rows={10}
            disabled={isActive}
            className="field-input resize-y font-mono"
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
  status: UploadStatus
  progress: number
  error: string | null
  onAbort: () => void
  onReset: () => void
}) {
  // "initiating" / "completing" have no meaningful percentage yet — show an
  // indeterminate (animated) bar instead of a frozen value.
  const indeterminate = status === 'initiating' || status === 'completing'

  return (
    <div className="space-y-3">
      {isActive ? (
        <>
          <div
            className="w-full bg-white/10 rounded-full h-2 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={indeterminate ? undefined : progress}
            aria-label={STATUS_LABELS[status]}
          >
            <div
              className={`bg-white h-2 rounded-full transition-all duration-300 ${
                indeterminate ? 'w-1/3 animate-pulse' : ''
              }`}
              style={indeterminate ? undefined : { width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="opacity-60 animate-pulse">
              {STATUS_LABELS[status]}
            </span>
            <span className="opacity-60">
              {indeterminate ? '' : `${progress}%`}
            </span>
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
            <p
              role="alert"
              className="text-sm text-red-400 p-3 bg-red-500/10 rounded border border-red-500/20"
            >
              {error}
              <button
                type="button"
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
              className="btn-primary w-full py-3 island-shell"
            >
              Upload
            </button>
          )}
        </>
      )}
    </div>
  )
}
