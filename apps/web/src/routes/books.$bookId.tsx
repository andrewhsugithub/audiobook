import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'

import Header from '../components/Header'
import Rating from '../components/Rating'
import { HlsAudioPlayer } from '../components/HlsAudio'
import { useHlsStream } from '../hooks/useHlsStream'
import { useAudiobookInfo } from '../hooks/useAudiobookInfo'
import { UploadForm } from '../components/forms/UploadForm'
import { EditBookForm } from '../components/forms/EditBookForm'
import { useAuth } from '../hooks/useAuth'
import {
  useIsInLibrary,
  useAddToLibrary,
  useRemoveFromLibrary,
} from '../hooks/useLibrary'
import { API_BASE_URL as BASE_URL } from '../utils/api'
import { useToast } from '../components/Toast'

export const Route = createFileRoute('/books/$bookId')({
  head: ({ params }) => ({
    meta: [{ title: `Audiobook · ${params.bookId}` }],
  }),
  component: BookComponent,
})

function BookComponent() {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { title } = Route.useSearch() as { title?: string }
  const bookId = Route.useParams().bookId

  const { user, userId, isLoggedIn } = useAuth()

  const [isEditing, setIsEditing] = useState(false)

  const { data: isInLibrary = false } = useIsInLibrary(bookId, isLoggedIn)
  const addToLibrary = useAddToLibrary()
  const removeFromLibrary = useRemoveFromLibrary()

  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)

  const {
    data: book,
    isLoading: isInfoLoading,
    isError: isInfoError,
    error: infoError,
  } = useAudiobookInfo(bookId)

  const {
    isLoading: isStreamLoading,
    isError: isStreamError,
    error: streamError,
    isSuccess: isStreamReady,
  } = useHlsStream(bookId, { enabled: book?.isReady === true })

  const audioURL = `${BASE_URL}/audiobook/${bookId}/master.m3u8`

  // ── Dynamic Permissions Configuration ──────────────────────────────
  // - Admin: can modify anything anywhere
  // - Owner: can modify only if the audiobook is flagged as private
  const canEdit =
    isLoggedIn &&
    book != null &&
    (user?.role === 'admin' ||
      (book.isOwner === true && book.visibility === 'private'))

  // Clean up object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview)
    }
  }, [coverPreview])

  // Reset cover changes and close editing if permissions dynamically change
  useEffect(() => {
    if (!isEditing) {
      setCoverFile(null)
      setCoverPreview(null)
    }
  }, [isEditing])

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file (PNG, JPG, etc.)')
      return
    }
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
  }

  const clearCoverChanges = () => {
    setCoverFile(null)
    setCoverPreview(null)
  }

  const addToMyLibrary = () => {
    if (!isLoggedIn) {
      toast.error('Sign in to save books to your library.')
      return
    }
    if (isInLibrary || !book) return
    addToLibrary.mutate(book.id, {
      onError: (err) => toast.error(err.message),
      onSuccess: () => toast.success('Added to your library.'),
    })
  }

  const removeFromMyLibrary = () => {
    if (!book) return
    removeFromLibrary.mutate(book.id, {
      onError: (err) => toast.error(err.message),
      onSuccess: () => toast.success('Removed from library.'),
    })
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
        title={title || book?.title || 'Loading Audio Title…'}
        backTo="/library"
        backSearch={{ title: title || 'Library' }}
      />

      {/* ── Admin / Owner Toolbar ────────────────────────────────────── */}
      {isLoggedIn && canEdit && (
        <div className="max-w-212.5 mx-auto px-4 mt-4 flex justify-end">
          <button
            onClick={() => setIsEditing((prev) => !prev)}
            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
          >
            {isEditing ? 'Cancel Edit Mode' : '✏️ Edit Book'}
          </button>
        </div>
      )}

      <main className="p-2.5 content-start max-w-212.5 mx-auto gap-10 grid min-[551px]:grid-cols-[minmax(150px,1fr)_1.5fr] h-screen">
        {/* ── Cover Element ───────────────────────────────────────────── */}
        <div className="group [perspective:900px] relative">
          <span className="grid place-content-center overflow-hidden relative aspect-1/1.5 border border-solid border-[rgba(245,240,214,0.12)] shadow-[0.25rem_0.25rem_0_#0f0d0e] bg-neutral-900 rounded-sm">
            {isInfoLoading ? (
              <div className="animate-pulse text-xs opacity-40">
                Loading Cover…
              </div>
            ) : coverPreview || book?.coverUrl ? (
              <img
                src={coverPreview || book?.coverUrl}
                alt={book?.title || 'Book cover'}
                className={`min-w-full min-h-full top-0 left-0 absolute object-cover transition-opacity ${
                  isEditing ? 'opacity-40' : 'opacity-100'
                }`}
              />
            ) : (
              <span className="text-xs opacity-40">No Cover</span>
            )}

            {/* Direct Image Placement Input Layer Overlay */}
            {isEditing && !isInfoLoading && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 z-10 p-4 text-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white text-black hover:bg-white/90 rounded-md text-xs font-semibold shadow transition-colors"
                >
                  📷 {coverPreview ? 'Change' : 'Upload'} Cover
                </button>
                {coverPreview && (
                  <span className="text-[10px] text-green-400 font-medium bg-green-950/80 px-2 py-0.5 rounded border border-green-500/20">
                    New Image Selected
                  </span>
                )}
              </div>
            )}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverChange}
            className="hidden"
          />
        </div>

        {/* ── Details Module ──────────────────────────────────────────── */}
        <div className="flex flex-col justify-center">
          {isEditing && book ? (
            <>
              <EditBookForm
                book={book}
                coverFile={coverFile}
                clearCover={clearCoverChanges}
                onClose={() => setIsEditing(false)}
              />

              {/* Reupload section inside edit mode */}
              {userId && (
                <div className="mt-12 border-t border-white/10 pt-8">
                  <h3 className="text-lg font-semibold mb-4 text-white/80">
                    Replace Audio Content
                  </h3>
                  <UploadForm
                    existingBookId={book.id}
                    existingTitle={book.title}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              {/* ── Read-only view ─────────────────────────────────────── */}
              <h2 className="display-title text-3xl font-bold">
                {isInfoLoading ? (
                  <span className="animate-pulse bg-white/10 rounded h-8 w-48 block" />
                ) : (
                  book?.title
                )}
              </h2>

              <small className="mt-4 text-xl uppercase opacity-70 block">
                {isInfoLoading ? (
                  <span className="animate-pulse bg-white/5 rounded h-5 w-24 block" />
                ) : (
                  book?.author || 'Anonymous Author'
                )}
              </small>

              <div className="mt-4 flex items-center gap-2 text-sm font-semibold tracking-wide">
                {isInfoLoading ? (
                  <span className="animate-pulse bg-white/5 rounded h-5 w-24 block" />
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs uppercase ${
                      book?.visibility === 'public'
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-white/5 text-white/50 border border-white/10'
                    }`}
                  >
                    <span>{book?.visibility === 'public' ? '🌐' : '🔒'}</span>
                    <span>{book?.visibility || 'private'}</span>
                  </span>
                )}
              </div>

              <span className="block pt-4">
                {!isInfoLoading && book?.ratings ? (
                  <Rating rating={book.ratings} />
                ) : (
                  <span className="text-sm opacity-50">
                    No structural reviews yet
                  </span>
                )}
              </span>

              {/* ── Library Sync Interactive Actions Area ──────────────── */}
              <div className="mt-8 flex gap-3">
                {isLoggedIn ? (
                  isInLibrary ? (
                    <button
                      onClick={removeFromMyLibrary}
                      disabled={isInfoLoading || removeFromLibrary.isPending}
                      className="rounded-full px-6 py-3 transition-all duration-300 font-medium bg-white/10 border border-white/10 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                    >
                      {removeFromLibrary.isPending
                        ? 'Removing…'
                        : '✓ In My Library'}
                    </button>
                  ) : (
                    <button
                      onClick={addToMyLibrary}
                      disabled={isInfoLoading || addToLibrary.isPending}
                      className="rounded-full px-6 py-3 transition-all duration-300 font-medium island-shell hover:scale-105 disabled:opacity-50"
                    >
                      {addToLibrary.isPending ? 'Saving…' : '+ My Library'}
                    </button>
                  )
                ) : (
                  <Link
                    to="/sign-in"
                    className="rounded-full px-6 py-3 transition-all duration-300 font-medium bg-white/5 hover:bg-white/10 inline-block text-center text-sm"
                  >
                    Sign In to Save
                  </Link>
                )}
              </div>

              {/* Description */}
              <div className="mt-10 max-w-3xl leading-8 text-[var(--sea-ink-soft)]">
                {isInfoLoading ? (
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

              {/* Stream / Player */}
              <div className="mt-6 min-h-[60px] flex flex-col justify-center">
                {book?.isReady === false &&
                  (book.status === 'initiated' ? (
                    <div className="text-sm text-red-400 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                      ❌ No content is currently available for this audiobook.
                      <br />
                      Please provide content to process.
                    </div>
                  ) : book.status === 'failed' ? (
                    <div className="text-sm text-red-400 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                      ❌ This audiobook failed to process.{' '}
                      {book.errorMessage
                        ? `Error: ${book.errorMessage}`
                        : 'Please try re-uploading the content.'}
                    </div>
                  ) : (
                    <div className="text-sm text-yellow-400 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                      ⚠️ This audiobook is still being processed. Check back
                      later!
                    </div>
                  ))}
                {isStreamLoading && (
                  <div className="text-sm opacity-60 animate-pulse flex items-center gap-2">
                    <span>🔒</span> Establishing secure audio stream connection…
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
            </>
          )}
        </div>
      </main>
    </div>
  )
}
