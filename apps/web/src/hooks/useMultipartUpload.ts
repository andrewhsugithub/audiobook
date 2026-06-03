import { useState, useCallback, useEffect, useRef } from 'react'
import { API_BASE_URL as API_URL } from '../utils/api'

const CHUNK_SIZE = 10 * 1024 * 1024 // 10MB per part
const PART_RETRIES = 3 // retry a failed part this many times before giving up

export type UploadStatus =
  | 'idle'
  | 'initiating'
  | 'uploading'
  | 'completing'
  | 'done'
  | 'error'

interface UploadState {
  status: UploadStatus
  progress: number // 0-100
  bookId: string | null
  error: string | null
}

interface InitiateResponse {
  bookId: string
  uploadId: string
  fileKey: string
  strategy: 'multipart' | 'direct-write'
}

interface PresignedUrlsResponse {
  presignedUrls: Array<{ partNumber: number; url: string }>
}

// Upload a single part, retrying transient failures with linear backoff.
async function putPartWithRetry(
  url: string,
  chunk: Blob,
  contentType: string,
  signal: AbortSignal,
  attempts = PART_RETRIES,
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        body: chunk,
        headers: { 'Content-Type': contentType },
        signal,
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      return res
    } catch (err) {
      // Don't retry deliberate aborts.
      if (signal.aborted) throw err
      lastError = err
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 300 * attempt))
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Part upload failed after retries')
}

export function useMultipartUpload() {
  const [state, setState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    bookId: null,
    error: null,
  })

  // Track in-flight upload so we can abort
  const abortRef = useRef<{
    bookId: string
    uploadId: string
    fileKey: string
  } | null>(null)

  // Cancels in-flight fetches (on user abort or unmount)
  const controllerRef = useRef<AbortController | null>(null)

  // Cancel any in-flight network on unmount to avoid leaks / state updates
  // after the component is gone.
  useEffect(() => {
    return () => controllerRef.current?.abort()
  }, [])

  const patch = (update: Partial<UploadState>) =>
    setState((prev) => ({ ...prev, ...update }))

  // 📁 Multipart Chunk Upload Controller (Files)
  const upload = useCallback(
    async (
      file: File,
      metadata: {
        userId: string
        title?: string
        author?: string
        description?: string
        existingBookId?: string
      },
    ) => {
      patch({ status: 'initiating', progress: 0, error: null, bookId: null })

      const controller = new AbortController()
      controllerRef.current = controller
      const { signal } = controller

      try {
        const targetUrl = metadata.existingBookId
          ? `${API_URL}/audiobook/${metadata.existingBookId}/reupload`
          : `${API_URL}/upload`

        const initiateRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal,
          body: JSON.stringify({
            fileName: file.name,
            fileSizeBytes: file.size,
            userId: metadata.userId,
            title: metadata.title ?? file.name.replace(/\.[^.]+$/, ''),
            author: metadata.author,
            description: metadata.description,
          }),
        })

        if (!initiateRes.ok) {
          const err = await initiateRes.json().catch(() => ({}))
          throw new Error(
            (err as any).error ?? `Initiate failed: ${initiateRes.status}`,
          )
        }

        const initiated: InitiateResponse = await initiateRes.json()
        const { bookId, uploadId, fileKey } = initiated

        patch({ bookId })

        // Track for abort
        abortRef.current = { bookId, uploadId, fileKey }

        //  Split file into parts
        const totalParts = Math.ceil(file.size / CHUNK_SIZE)

        //  Get presigned URLs
        const urlsRes = await fetch(`${API_URL}/upload/get-presigned-urls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal,
          body: JSON.stringify({ fileKey, uploadId, totalParts, bookId }),
        })

        if (!urlsRes.ok)
          throw new Error(`Failed to get upload URLs: ${urlsRes.status}`)

        const { presignedUrls }: PresignedUrlsResponse = await urlsRes.json()

        // Upload each part directly to S3
        patch({ status: 'uploading' })

        const completedParts: Array<{ partNumber: number; etag: string }> = []
        let uploadedParts = 0

        // Upload parts with limited concurrency (5 at a time)
        const CONCURRENCY = 5
        for (let i = 0; i < presignedUrls.length; i += CONCURRENCY) {
          const batch = presignedUrls.slice(i, i + CONCURRENCY)

          await Promise.all(
            batch.map(async ({ partNumber, url }) => {
              const start = (partNumber - 1) * CHUNK_SIZE
              const end = Math.min(start + CHUNK_SIZE, file.size)
              const chunk = file.slice(start, end)

              const partRes = await putPartWithRetry(
                url,
                chunk,
                file.type || 'application/octet-stream',
                signal,
              )

              // ETag is required for completing multipart upload
              const etag =
                partRes.headers.get('ETag') ?? partRes.headers.get('etag') ?? ''

              completedParts.push({ partNumber, etag: etag.replace(/"/g, '') })

              uploadedParts++
              patch({
                progress: Math.round((uploadedParts / totalParts) * 90),
                // Leave last 10% for complete step
              })
            }),
          )
        }

        // Sort parts by partNumber (required by S3/R2)
        completedParts.sort((a, b) => a.partNumber - b.partNumber)

        // Complete Upload
        patch({ status: 'completing', progress: 92 })

        const completeRes = await fetch(`${API_URL}/upload/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal,
          body: JSON.stringify({
            uploadId,
            fileKey,
            parts: completedParts,
            userId: metadata.userId,
            bookId,
            fileName: file.name,
          }),
        })

        if (!completeRes.ok) {
          const err = await completeRes.json().catch(() => ({}))
          throw new Error(
            (err as any).error ?? `Complete failed: ${completeRes.status}`,
          )
        }

        abortRef.current = null
        controllerRef.current = null
        patch({ status: 'done', progress: 100 })

        return bookId
      } catch (error: any) {
        console.error('[upload] Failed:', error)
        patch({ status: 'error', error: error.message })

        // Auto-abort on failure to clean up R2
        if (abortRef.current) {
          await abortUpload(abortRef.current).catch(console.error)
          abortRef.current = null
        }

        throw error
      }
    },
    [],
  )

  // 📝 Direct Raw Text Upload Controller (Text Paste Option)
  const uploadText = useCallback(
    async (
      text: string,
      metadata: {
        userId: string
        title?: string
        author?: string
        description?: string
        existingBookId?: string
      },
    ) => {
      patch({ status: 'uploading', progress: 0, error: null, bookId: null })

      const controller = new AbortController()
      controllerRef.current = controller

      const targetUrl = metadata.existingBookId
        ? `${API_URL}/audiobook/${metadata.existingBookId}/reupload`
        : `${API_URL}/upload`

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({ text, ...metadata }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = (err as any).error ?? `Upload failed: ${res.status}`
        patch({ status: 'error', error: msg })
        throw new Error(msg)
      }

      const data = await res.json()
      controllerRef.current = null
      patch({ status: 'done', progress: 100, bookId: data.bookId })
      return data.bookId as string
    },
    [],
  )

  // Abort Upload
  const abort = useCallback(async () => {
    controllerRef.current?.abort()
    controllerRef.current = null
    if (abortRef.current) {
      await abortUpload(abortRef.current)
      abortRef.current = null
    }
    patch({ status: 'idle', progress: 0, error: null })
  }, [])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    patch({ status: 'idle', progress: 0, error: null, bookId: null })
  }, [])

  return { state, upload, uploadText, abort, reset }
}

async function abortUpload(info: {
  bookId: string
  uploadId: string
  fileKey: string
}) {
  await fetch(`${API_URL}/upload/abort`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(info),
  })
}
