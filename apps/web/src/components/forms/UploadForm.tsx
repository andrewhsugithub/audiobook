import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { useMultipartUpload } from '../../hooks/useMultipartUpload'
import type { UploadStatus } from '../../hooks/useMultipartUpload'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../Toast'
import { metadataFieldMap, MetadataFields } from './MetaFields'
import { useAppForm } from '../../context/form-context'
import { useAddToLibrary } from '../../hooks/useLibrary'
import { queryClient } from '../../router'

const ACCEPTED_EXTENSIONS = ['.pdf', '.txt']
const MAX_FILE_SIZE = 50 * 1024 * 1024

const STATUS_LABELS: Record<UploadStatus, string> = {
  idle: '',
  initiating: 'Preparing upload…',
  uploading: 'Uploading…',
  completing: 'Finalising…',
  done: 'Upload complete!',
  error: 'Upload failed',
}

const metadataSchema = z.object({
  title: z.string(),
  author: z.string(),
})

function validateFile(file: File): string | null {
  const name = file.name.toLowerCase()
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return `Unsupported file type. Please upload a ${ACCEPTED_EXTENSIONS.join(' or ')} file.`
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB).`
  }
  return null
}

interface Props {
  existingBookId?: string
  existingTitle?: string
}

export function UploadForm({ existingBookId, existingTitle }: Props) {
  const navigate = useNavigate()
  const toast = useToast()
  const { userId } = useAuth()
  const { state, upload, uploadText, abort, reset } = useMultipartUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const isReupload = !!existingBookId
  const isActive = ['initiating', 'uploading', 'completing'].includes(
    state.status,
  )
  const addToLibrary = useAddToLibrary()

  const fileForm = useAppForm({
    defaultValues: { title: existingTitle ?? '', author: '' },
    validators: { onSubmit: metadataSchema },
    onSubmit: async ({ value }) => {
      if (!userId) return
      if (!selectedFile) {
        setFileError('Please choose a file to upload.')
        return
      }
      try {
        const bookId = await upload(selectedFile, {
          userId,
          title: value.title,
          author: value.author,
          existingBookId,
        })

        await queryClient.invalidateQueries({
          queryKey: ['audiobook-info', bookId],
        })

        toast.success('Upload complete — processing started.')

        addToLibrary.mutate(bookId)
        if (!isReupload) navigate({ to: '/books/$bookId', params: { bookId } })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed.')
      }
    },
  })

  const textForm = useAppForm({
    defaultValues: { title: existingTitle ?? '', author: '', textContent: '' },
    validators: {
      onSubmit: metadataSchema.extend({
        textContent: z
          .string()
          .min(1, 'Please paste some text before uploading.'),
      }),
    },
    onSubmit: async ({ value }) => {
      if (!userId) return
      try {
        const bookId = await uploadText(value.textContent, {
          userId,
          title: value.title,
          author: value.author,
          existingBookId,
        })
        toast.success('Upload complete — processing started.')
        if (!isReupload) navigate({ to: '/books/$bookId', params: { bookId } })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed.')
      }
    },
  })

  const pickFile = (file: File | null) => {
    setFileError(null)
    if (!file) {
      setSelectedFile(null)
      return
    }
    const err = validateFile(file)
    if (err) {
      setFileError(err)
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (isActive) return
    pickFile(e.dataTransfer.files?.[0] ?? null)
  }

  return (
    <div className="mx-auto w-full max-w-lg p-6">
      <h2 className="text-xl font-semibold mb-4">
        {isReupload
          ? `Replace file for "${existingTitle}"`
          : 'Upload Audiobook'}
      </h2>

      <div className="tabs tabs-border mb-6" role="tablist">
        {(['file', 'text'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`tab ${activeTab === tab ? 'tab-active' : ''}`}
          >
            {tab === 'file' ? 'PDF / TXT File' : 'Paste Text'}
          </button>
        ))}
      </div>

      {activeTab === 'file' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            fileForm.handleSubmit()
          }}
          className="space-y-4"
        >
          <fileForm.AppForm>
            {!isReupload && (
              <MetadataFields
                form={fileForm}
                fields={metadataFieldMap}
                disabled={isActive}
              />
            )}

            {fileError && <FieldAlert message={fileError} />}

            <div>
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
                    : 'border-[var(--line)]'
                }`}
              >
                <input
                  id="upload-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt"
                  disabled={isActive}
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-[var(--sea-ink-soft)] file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[var(--surface-strong)] file:px-4 file:py-2 file:font-medium file:text-[var(--sea-ink)]"
                />
                <p className="mt-2 opacity-60">
                  {selectedFile
                    ? `Selected: ${selectedFile.name}`
                    : 'Drag & drop a .pdf or .txt file here, or browse above.'}
                </p>
              </div>
            </div>

            <UploadActions
              isActive={isActive}
              status={state.status}
              progress={state.progress}
              error={state.error}
              onAbort={abort}
              onReset={reset}
            />
          </fileForm.AppForm>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            textForm.handleSubmit()
          }}
          className="space-y-4"
        >
          <textForm.AppForm>
            {!isReupload && (
              <MetadataFields
                form={textForm}
                fields={metadataFieldMap}
                disabled={isActive}
              />
            )}

            <textForm.Field name="textContent">
              {(field) => (
                <div className="space-y-1">
                  <label htmlFor={field.name} className="field-label">
                    Book text
                  </label>
                  <textarea
                    id={field.name}
                    placeholder="Paste your book text here…"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    rows={10}
                    disabled={isActive}
                    className="field-input resize-y font-mono"
                  />
                  {field.state.meta.errors.length > 0 && (
                    <FieldAlert
                      message={field.state.meta.errors
                        .map((err: any) => err?.message ?? err)
                        .join(', ')}
                    />
                  )}
                </div>
              )}
            </textForm.Field>

            <UploadActions
              isActive={isActive}
              status={state.status}
              progress={state.progress}
              error={state.error}
              onAbort={abort}
              onReset={reset}
            />
          </textForm.AppForm>
        </form>
      )}
    </div>
  )
}

function FieldAlert({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="text-sm text-error p-3 bg-red-500/10 rounded border border-red-500/20"
    >
      {message}
    </p>
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
  const indeterminate = status === 'initiating' || status === 'completing'

  return (
    <div className="space-y-3">
      {isActive ? (
        <>
          <div
            className="w-full bg-[var(--line)] rounded-full h-2 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={indeterminate ? undefined : progress}
            aria-label={STATUS_LABELS[status]}
          >
            <div
              className={`bg-[var(--lagoon-deep)] h-2 rounded-full transition-all duration-300 ${indeterminate ? 'w-1/3 animate-pulse' : ''}`}
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
            className="btn btn-outline btn-error btn-sm btn-block"
          >
            Cancel Upload
          </button>
        </>
      ) : (
        <>
          {error && (
            <p
              role="alert"
              className="text-sm text-error p-3 bg-red-500/10 rounded border border-red-500/20"
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
            <p className="text-sm text-success">
              ✓ Upload complete — processing started
            </p>
          )}
          {status !== 'done' && (
            <button
              type="submit"
              disabled={isActive}
              className="btn btn-primary btn-block"
            >
              Upload
            </button>
          )}
        </>
      )}
    </div>
  )
}
