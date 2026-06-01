import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import Rating from '../components/Rating'
import Header from '../components/Header'
import AudioPlayer from '../components/AudioPlayer'
import { HlsAudioPlayer } from '../components/HlsAudio'
import { useHlsStream } from '../hooks/useHlsStream'
import { useAudiobookInfo } from '../hooks/useAudiobookInfo'
import { UploadForm } from '../components/UploadForm'

export const Route = createFileRoute('/books/$bookId')({
  component: BookComponent,
})

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'

function BookComponent() {
  const queryClient = useQueryClient()
  const { title } = Route.useSearch() as { title?: string }
  const bookId = Route.useParams().bookId
  const isAdmin = true // TODO: wire to real auth
  const userId = 'd6c5a7cc-2aa3-4fd7-e2d9-1ff91a3b254d' // hardcoded for testing, replace with real user context

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Cover image editing state
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [editForm, setEditForm] = useState({
    title: '',
    author: '',
    description: '',
    ratings: 0,
  })

  // Revoke object URL to avoid memory leaks
  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview)
    }
  }, [coverPreview])

  const toggleEdit = () => {
    setSaveError(null)
    setCoverFile(null)
    setCoverPreview(null)

    if (!isEditing && book) {
      setEditForm({
        title: book.title || '',
        author: book.author || '',
        description: book.description || '',
        ratings: book.ratings || 0,
      })
    }
    setIsEditing(!isEditing)
  }

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setSaveError('Please upload a valid image file (PNG, JPG, etc.)')
      return
    }

    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
    setSaveError(null)
  }

  const handleSaveMetadata = async () => {
    setIsSaving(true)
    setSaveError(null)

    try {
      let res: Response

      // If a new cover is selected, send as FormData.
      // If your backend requires JSON for metadata and a separate endpoint
      // for covers, split this into two requests.
      if (coverFile) {
        const formData = new FormData()
        formData.append('title', editForm.title)
        formData.append('author', editForm.author)
        formData.append('description', editForm.description)
        formData.append('ratings', String(editForm.ratings))
        formData.append('cover', coverFile)

        res = await fetch(`${BASE_URL}/audiobook/${bookId}`, {
          method: 'PATCH',
          body: formData,
        })
      } else {
        res = await fetch(`${BASE_URL}/audiobook/${bookId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editForm),
        })
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => 'Unknown server error')
        throw new Error(`Server error ${res.status}: ${errBody}`)
      }

      // Force refresh book data so the UI reflects changes immediately
      await queryClient.invalidateQueries({
        queryKey: ['audiobookInfo', bookId],
      })

      setIsEditing(false)
      setCoverFile(null)
      setCoverPreview(null)
    } catch (err: any) {
      console.error('Error updating metadata', err)
      setSaveError(
        err?.message || 'Failed to connect to the server. Is it running?',
      )
    } finally {
      setIsSaving(false)
    }
  }

  const {
    data: book,
    isLoading: isInfoLoading,
    isError: isInfoError,
    error: infoError,
    refetch: refetchBook,
  } = useAudiobookInfo(bookId)

  const {
    isLoading: isStreamLoading,
    isError: isStreamError,
    error: streamError,
    isSuccess: isStreamReady,
  } = useHlsStream(bookId, {
    enabled: book?.isReady === true,
  })
  // const audioURL =
  //   'https://playertest.longtailvideo.com/adaptive/alt-audio-no-video/angel-one.m3u8'
  // const audioURL =
  //   'https://stream.mux.com/BV3YZtogl89mg9VcNBhhnHm02Y34zI1nlMuMQfAbl3dM/highest.mp4'

  const audioURL = `${BASE_URL}/audiobook/${bookId}/master.m3u8`

  const savedBooks = JSON.parse(localStorage.getItem('myBooks') || '[]')

  const [isInLibrary, setIsInLibrary] = useState(false)

  useEffect(() => {
    const savedBooks = JSON.parse(localStorage.getItem('myBooks') || '[]')

    const exists = savedBooks.some(
      (item: any) => String(item.id) === String(bookId),
    )

    setIsInLibrary(exists)
  }, [bookId])

  // Refetch after successful save so UI reflects changes
  useEffect(() => {
    if (saveSuccess) {
      refetchBook()
    }
  }, [saveSuccess])

  const addToMyLibrary = () => {
    if (isInLibrary) return

    if (!book) return

    const savedBooks = JSON.parse(localStorage.getItem('myBooks') || '[]')

    localStorage.setItem('myBooks', JSON.stringify([...savedBooks, book]))

    setIsInLibrary(true)
  }

  if (isInfoError) {
    return (
      <div className="min-w-[360px] p-6 text-center text-red-400">
        <p className="font-semibold">Failed to load audiobook metadata:</p>
        <p className="text-sm opacity-70">{infoError?.message}</p>
      </div>
    )
  }

  return (
    <div className="min-w-[360px] pb-20">
      <Header
        title={title || book?.title || 'Loading Audio Title...'}
        backTo="/library"
        backSearch={{ title: title || 'Library' }}
      />

      {/* ── Admin toolbar ─────────────────────────────────────────────────── */}
      {isAdmin && (
        <div className="max-w-212.5 mx-auto px-4 mt-4 flex justify-end">
          <button
            onClick={toggleEdit}
            disabled={isSaving}
            className="bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
          >
            {isEditing ? 'Cancel Edit Mode' : '✏️ Edit Book'}
          </button>
        </div>
      )}

      <main className="p-2.5 content-start max-w-212.5 mx-auto gap-10 grid min-[551px]:grid-cols-[minmax(150px,1fr)_1.5fr]">
        {/* Cover Image */}
        <div className="group [perspective:900px]">
          <span className="grid place-content-center overflow-hidden relative aspect-1/1.5 border border-solid border-[rgba(245,240,214,0.12)] shadow-[0.25rem_0.25rem_0_#0f0d0e] bg-neutral-900 rounded-sm">
            {isInfoLoading ? (
              <div className="animate-pulse text-xs opacity-40">
                Loading Cover...
              </div>
            ) : coverPreview || book?.coverUrl ? (
              <img
                src={coverPreview || book?.coverUrl}
                alt={book?.title || 'Book cover'}
                className="min-w-full min-h-full top-0 left-0 absolute object-cover"
              />
            ) : (
              <span className="text-xs opacity-40">No Cover</span>
            )}

            {isEditing && (
              <>
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 z-10">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-medium transition-colors backdrop-blur-sm"
                  >
                    📷 {coverPreview ? 'Change' : 'Upload'} Cover
                  </button>
                  {coverPreview && (
                    <span className="text-xs text-white/60">
                      New image selected
                    </span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverChange}
                  className="hidden"
                />
              </>
            )}
          </span>
        </div>

        {/* Details */}
        <div className="flex flex-col justify-center">
          {/* Inline error banner */}
          {saveError && (
            <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              ⚠️ {saveError}
            </div>
          )}

          {/* Title */}
          {isEditing ? (
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-white/50 font-medium">
                Title
              </label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, title: e.target.value }))
                }
                className="text-2xl font-bold bg-white/5 border border-white/20 rounded-lg p-3 text-white w-full focus:outline-none focus:border-white/40 focus:bg-white/10 transition-colors"
                placeholder="Book title"
              />
            </div>
          ) : (
            <h2 className="display-title text-3xl font-bold">
              {isInfoLoading ? (
                <span className="animate-pulse bg-white/10 rounded h-8 w-48 block" />
              ) : (
                book?.title
              )}
            </h2>
          )}

          {/* Author */}
          {isEditing ? (
            <div className="mt-4 space-y-1">
              <label className="text-xs uppercase tracking-wider text-white/50 font-medium">
                Author
              </label>
              <input
                type="text"
                value={editForm.author}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, author: e.target.value }))
                }
                className="text-lg bg-white/5 border border-white/20 rounded-lg p-3 text-white w-full uppercase focus:outline-none focus:border-white/40 focus:bg-white/10 transition-colors"
                placeholder="Author name"
              />
            </div>
          ) : (
            <small className="mt-4 text-xl uppercase opacity-70 block">
              {isInfoLoading ? (
                <span className="animate-pulse bg-white/5 rounded h-5 w-24 block" />
              ) : (
                book?.author || 'Anonymous Author'
              )}
            </small>
          )}

          {/* Rating */}
          <span className="block pt-4">
            {isEditing ? (
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider text-white/50 font-medium block">
                  Rating (0 – 5)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={editForm.ratings}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        ratings: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="flex-1 bg-white/5 border border-white/20 rounded-lg p-2 w-24 text-white focus:outline-none focus:border-white/40 transition-colors"
                  />
                  <span className="w-10 text-sm text-white/40">
                    {editForm.ratings} / 5
                  </span>
                </div>
              </div>
            ) : (
              <>
                {!isInfoLoading && book?.ratings ? (
                  <Rating rating={book.ratings} />
                ) : (
                  <span className="text-sm opacity-50">
                    No structural reviews yet
                  </span>
                )}
              </>
            )}
          </span>

          {/* Library Button */}
          <div className="mt-8 flex gap-4">
            <button
              onClick={addToMyLibrary}
              disabled={isInLibrary || isInfoLoading}
              className={`rounded-full px-6 py-3 transition-all duration-300 font-medium ${
                isInLibrary || isInfoLoading
                  ? 'cursor-not-allowed opacity-50 bg-white/5'
                  : 'island-shell hover:scale-105'
              }`}
            >
              {isInLibrary ? '✓ In My Library' : '+ My Library'}
            </button>
          </div>

          {/* Description */}
          <div className="mt-10 max-w-3xl leading-8 text-[var(--sea-ink-soft)]">
            {isEditing ? (
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider text-white/50 font-medium">
                  Description
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg p-3 text-white h-40 resize-y focus:outline-none focus:border-white/40 focus:bg-white/10 transition-colors"
                  placeholder="Enter book description..."
                />
              </div>
            ) : isInfoLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 bg-white/5 rounded w-full" />
                <div className="h-4 bg-white/5 rounded w-5/6" />
                <div className="h-4 bg-white/5 rounded w-4/6" />
              </div>
            ) : (
              book?.description || (
                <i>No description available for this book.</i>
              )
            )}
          </div>

          {/* Save / Cancel */}
          {isEditing && (
            <div className="mt-8 flex gap-3">
              <button
                onClick={handleSaveMetadata}
                disabled={isSaving}
                className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <span className="inline-block animate-spin">⏳</span>
                    Saving…
                  </>
                ) : (
                  <>💾 Save Changes</>
                )}
              </button>
              <button
                onClick={toggleEdit}
                disabled={isSaving}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Stream / Player */}
          <div className="mt-6 min-h-[60px] flex flex-col justify-center">
            {book?.isReady === false &&
              (book?.status === 'initiated' ? (
                <div className="text-sm text-red-400 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                  ❌ No content is currently available for this audiobook.
                  <br />
                  Please provide content to process.
                </div>
              ) : book?.status === 'failed' ? (
                <div className="text-sm text-red-400 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                  ❌ This audiobook failed to process.{' '}
                  {book?.errorMessage
                    ? `Error: ${book.errorMessage}`
                    : 'Please try re-uploading the content.'}
                </div>
              ) : (
                <div className="text-sm text-yellow-400 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  ⚠️ This audiobook is still being processed. Check back later!
                </div>
              ))}
            {isStreamLoading && (
              <div className="text-sm opacity-60 animate-pulse flex items-center gap-2">
                <span>🔒</span> Establishing secure audio stream connection...
              </div>
            )}
            {isStreamError && (
              <div className="text-sm text-red-400 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                ⚠️ Secure Stream Error: {streamError.message}
              </div>
            )}
            {isStreamReady && (
              <HlsAudioPlayer src={audioURL} title={book?.title} />
            )}
          </div>

          {/* Admin Upload */}
          {isAdmin && isEditing && (
            <div className="mt-12 border-t border-white/10 pt-8">
              <h3 className="text-lg font-semibold mb-4 text-white/80">
                Replace Audio Content
              </h3>
              <UploadForm
                userId={userId}
                existingBookId={book?.id}
                existingTitle={book?.title}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
