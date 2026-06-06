import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'

import Header from '../components/Header'
import Rating from '../components/Rating'
import { HlsAudioPlayer } from '../components/HlsAudio'
import { useHlsStream } from '../hooks/useHlsStream'
import {
  useAudiobookInfo,
  useAudiobookUploader,
} from '../hooks/useAudiobookInfo'
import { UploadForm } from '../components/forms/UploadForm'
import { EditBookForm } from '../components/forms/EditBookForm'
import { useAuth } from '../hooks/useAuth'
import {
  useIsInLibrary,
  useAddToLibrary,
  useRemoveFromLibrary,
} from '../hooks/useLibrary'
import BookmarkButton from '../components/BookmarkButton'
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

  const [isExpanded, setIsExpanded] = useState(false)

  const {
    data: book,
    isLoading: isInfoLoading,
    isError: isInfoError,
    error: infoError,
  } = useAudiobookInfo(bookId)

  const { data: uploaderData, isLoading: isUploaderLoading } =
    useAudiobookUploader(bookId)
  const uploader = uploaderData?.uploader

  const {
    isLoading: isStreamLoading,
    isError: isStreamError,
    error: streamError,
    isSuccess: isStreamReady,
  } = useHlsStream(bookId, { enabled: book?.isReady === true })

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

  // Consolidated click coordinator for the single bookmark toggle
  const handleBookmarkToggle = () => {
    if (!isLoggedIn) {
      toast.error('Sign in to save books to your library.')
      return
    }
    if (!book) return

    if (isInLibrary) {
      removeFromLibrary.mutate(book.id, {
        onError: (err) => toast.error(err.message),
        onSuccess: () => toast.success('Removed from library.'),
      })
    } else {
      addToLibrary.mutate(book.id, {
        onError: (err) => toast.error(err.message),
        onSuccess: () => toast.success('Added to your library.'),
      })
    }
  }

  if (isInfoError) {
    return (
      <div className="min-w-[360px] p-6 text-center text-error">
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
            className={`btn btn-sm ${isEditing ? 'btn-ghost' : 'btn-soft'}`}
          >
            {isEditing ? 'Cancel Edit Mode' : '✏️ Edit Book'}
          </button>
        </div>
      )}

      <main className="mx-auto grid max-w-212.5 grid-cols-1 items-start gap-10 p-2.5 pt-6 min-[551px]:grid-cols-[minmax(160px,1fr)_1.6fr]">
        {/* ── Cover Element ───────────────────────────────────────────── */}
        <div className="group relative [perspective:900px] min-[551px]:sticky min-[551px]:top-6">
          <span className="grid place-content-center overflow-hidden relative aspect-1/1.5 border border-solid border-[var(--line)] shadow-xl bg-[var(--surface-strong)] rounded-xl">
            {isInfoLoading ? (
              <div className="animate-pulse text-xs text-[var(--sea-ink-soft)]">
                Loading Cover…
              </div>
            ) : coverPreview || book?.coverUrl ? (
              <img
                src={coverPreview || book?.coverUrl}
                alt={book?.title || 'Book cover'}
                className={`min-w-full min-h-full top-0 left-0 absolute object-cover transition-opacity ${
                  isEditing ? 'opacity-70' : 'opacity-100'
                }`}
              />
            ) : (
              <span className="text-xs text-[var(--sea-ink-soft)]">
                No Cover
              </span>
            )}

            {/* Direct Image Placement Input Layer Overlay */}
            {isEditing && !isInfoLoading && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 z-10 p-4 text-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-sm btn-primary"
                >
                  📷 {coverPreview ? 'Change' : 'Upload'} Cover
                </button>
                {coverPreview && (
                  <span className="rounded border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-success">
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
        <div className="flex flex-col">
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
                <div className="mt-12 border-t border-[var(--line)] pt-8">
                  <h3 className="text-lg font-semibold mb-4 text-[var(--sea-ink)]">
                    Replace Audio Content
                  </h3>
                  <UploadForm
                    existingBookId={book.id}
                    existingTitle={book.title}
                    onClose={() => setIsEditing(false)}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              {/* ── Read-only view ─────────────────────────────────────── */}
              <h2 className="display-title text-3xl font-bold">
                {isInfoLoading ? (
                  <span className="animate-pulse bg-[var(--line)] rounded h-8 w-48 block" />
                ) : (
                  book?.title
                )}
              </h2>

              <small className="mt-4 text-xl uppercase opacity-70 block">
                {isInfoLoading ? (
                  <span className="animate-pulse bg-[var(--line)] rounded h-5 w-24 block" />
                ) : (
                  book?.author || 'Anonymous Author'
                )}
              </small>

              {/* ── Uploaded by Area (With loading fallback) ───────────── */}
              {isInfoLoading || isUploaderLoading ? (
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full animate-pulse bg-[var(--line)]" />
                  <div className="h-4 w-32 rounded animate-pulse bg-[var(--line)]" />
                </div>
              ) : (
                uploader?.name && (
                  <Link
                    to="/users/$userId"
                    params={{ userId: uploader.id }}
                    search={{ name: uploader.name }}
                    className="group mt-3 inline-flex w-fit items-center gap-2 text-sm text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--sea-ink)]"
                  >
                    {uploader.image ? (
                      <img
                        src={uploader.image}
                        alt={uploader.name}
                        className="h-5 w-5 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="grid h-5 w-5 place-content-center rounded-full bg-[var(--chip-bg)] text-[10px] font-semibold uppercase"
                      >
                        {uploader.name.charAt(0)}
                      </span>
                    )}
                    <span>
                      Uploaded by{' '}
                      <span className="font-semibold text-[var(--sea-ink)] group-hover:underline">
                        {uploader.name}
                      </span>
                    </span>
                  </Link>
                )
              )}

              <div className="mt-4 flex items-center gap-2 text-sm font-semibold tracking-wide">
                {isInfoLoading ? (
                  <span className="animate-pulse bg-[var(--line)] rounded h-5 w-24 block" />
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs uppercase ${
                      book?.visibility === 'public'
                        ? 'bg-green-500/10 text-success border border-green-500/20'
                        : 'bg-[var(--chip-bg)] text-[var(--sea-ink-soft)] border border-[var(--line)]'
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
              <div className="mt-8 flex items-center gap-4 w-full min-h-12 relative">
                {isInfoLoading ? (
                  <div className="h-12 w-12 rounded-full animate-pulse bg-[var(--line)] shrink-0" />
                ) : isLoggedIn ? (
                  <>
                    {/* Left Column: Bookmark Action (Prevented from shrinking) */}
                    <div className="flex items-center gap-3 shrink-0">
                      <BookmarkButton
                        isInLibrary={isInLibrary}
                        onClick={handleBookmarkToggle}
                        disabled={
                          addToLibrary.isPending || removeFromLibrary.isPending
                        }
                      />

                      {/* Visual Mutation Progress Indicator */}
                      {(addToLibrary.isPending ||
                        removeFromLibrary.isPending) && (
                        <span className="absolute top-full left-0 mt-2 -translate-x-1/6 text-xs text-[var(--sea-ink-soft)] animate-pulse font-medium whitespace-nowrap">
                          Syncing library…
                        </span>
                      )}
                    </div>

                    {/* Right Column: Player & Status Messaging Matrix (Stretches to fill line) */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      {book?.isReady === false &&
                        (book.status === 'initiated' ? (
                          <div className="text-sm text-error p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                            ❌ No content available. Please provide track
                            text/file.
                          </div>
                        ) : book.status === 'failed' ? (
                          <div className="text-sm text-error p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                            ❌ Processing failed.{' '}
                            {book.errorMessage
                              ? `Error: ${book.errorMessage}`
                              : 'Please try re-uploading.'}
                          </div>
                        ) : (
                          <div className="text-sm text-warning p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                            ⚠️ Audiobook is still processing. Check back later!
                          </div>
                        ))}

                      {(isInfoLoading || isStreamLoading) &&
                        book?.isReady === true && (
                          <div className="text-sm text-[var(--sea-ink-soft)] opacity-80 animate-pulse flex items-center gap-2 py-2">
                            <span>🔒</span> Establishing secure audio stream
                            connection…
                          </div>
                        )}

                      {isStreamError && (
                        <div className="text-sm text-error p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                          ⚠️ Secure Stream Error: {streamError.message}
                        </div>
                      )}

                      {isStreamReady && book?.version && (
                        <div className="w-full">
                          <HlsAudioPlayer
                            src={`${BASE_URL}/audiobook/${bookId}/${book.version}/master.m3u8`}
                            title={book?.title}
                          />
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center h-12">
                    <Link to="/sign-in" className="btn btn-primary">
                      Sign In to Listen and Save to Library
                    </Link>
                  </div>
                )}
              </div>
              {/* Visual Mutation Progress Indicator */}
              {/* {(addToLibrary.isPending || removeFromLibrary.isPending) && (
                  <span className="text-xs text-white/40 animate-pulse font-medium">
                    Syncing library…
                  </span>
                )} */}

              {/* Description */}
              <div className="mt-10 max-w-3xl leading-8 text-[var(--sea-ink-soft)]">
                {isInfoLoading ? (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-4 bg-[var(--line)] rounded w-full" />
                    <div className="h-4 bg-[var(--line)] rounded w-5/6" />
                    <div className="h-4 bg-[var(--line)] rounded w-4/6" />
                  </div>
                ) : !book?.description ? (
                  <i>No description available for this book.</i>
                ) : (
                  <div>
                    <p className={isExpanded ? 'block' : 'line-clamp-3'}>
                      {book.description}
                    </p>

                    {book.description.length > 200 && (
                      <button
                        type="button"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="mt-2 text-sm font-semibold text-[var(--lagoon-deep)] hover:text-[var(--lagoon)] transition-colors focus:outline-none block"
                      >
                        {isExpanded ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
