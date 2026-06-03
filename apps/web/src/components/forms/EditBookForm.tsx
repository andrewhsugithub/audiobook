import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { API_BASE_URL as BASE_URL } from '../../utils/api'
import { useToast } from '../Toast'
import type { AudiobookInfo } from '../../utils/queries'

const editSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  author: z.string(),
  description: z.string(),
  ratings: z.number().min(0).max(5),
  visibility: z.enum(['public', 'private']),
})

interface Props {
  book: AudiobookInfo & { visibility?: 'public' | 'private'; isOwner?: boolean }
  coverFile: File | null
  clearCover: () => void
  onClose: () => void
}

export function EditBookForm({ book, coverFile, clearCover, onClose }: Props) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const form = useForm({
    defaultValues: {
      title: book.title ?? '',
      author: book.author ?? '',
      description: book.description ?? '',
      ratings: book.ratings ?? 0,
      visibility: (book.visibility ?? 'private') as 'public' | 'private',
    },
    validators: { onSubmit: editSchema },
    onSubmit: async ({ value }) => {
      // Always use FormData so cover upload is optional but unified
      const formData = new FormData()
      formData.append('title', value.title)
      formData.append('author', value.author)
      formData.append('description', value.description)
      formData.append('ratings', String(value.ratings))
      formData.append('visibility', value.visibility)
      if (coverFile) formData.append('cover', coverFile)

      const res = await fetch(`${BASE_URL}/audiobook/${book.id}`, {
        method: 'PATCH',
        credentials: 'include',
        body: formData,
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => 'Unknown server error')
        throw new Error(`Server error ${res.status}: ${errBody}`)
      }

      await queryClient.invalidateQueries({
        queryKey: ['audiobook-info', book.id],
      })

      clearCover()
      toast.success('Book details saved.')
      onClose()
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="space-y-6"
    >
      {/* Title */}
      <form.Field name="title">
        {(field) => (
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider text-white/50 font-medium">
              Title
            </label>
            <input
              type="text"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              className="text-2xl font-bold bg-white/5 border border-white/20 rounded-lg p-3 text-white w-full focus:outline-none focus:border-white/40 transition-colors"
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-sm text-red-400">
                {field.state.meta.errors
                  .map((e: any) => e?.message ?? e)
                  .join(', ')}
              </p>
            )}
          </div>
        )}
      </form.Field>

      {/* Author */}
      <form.Field name="author">
        {(field) => (
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider text-white/50 font-medium">
              Author
            </label>
            <input
              type="text"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              className="bg-white/5 border border-white/20 rounded-lg p-3 text-white w-full uppercase focus:outline-none focus:border-white/40 transition-colors"
            />
          </div>
        )}
      </form.Field>

      {/* Rating */}
      <form.Field name="ratings">
        {(field) => (
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider text-white/50 font-medium block">
              Rating — {field.state.value.toFixed(1)} / 5
            </label>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={field.state.value}
              onChange={(e) =>
                field.handleChange(parseFloat(e.target.value) || 0)
              }
              className="w-full accent-white"
            />
          </div>
        )}
      </form.Field>

      {/* Visibility toggle */}
      <form.Field name="visibility">
        {(field) => (
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-white/50 font-medium block">
              Visibility
            </label>
            <button
              type="button"
              onClick={() =>
                field.handleChange(
                  field.state.value === 'public' ? 'private' : 'public',
                )
              }
              className={`
                relative inline-flex items-center gap-3 px-4 py-3 rounded-lg border transition-all w-full
                ${
                  field.state.value === 'public'
                    ? 'bg-green-500/10 border-green-500/40 text-green-400'
                    : 'bg-white/5 border-white/20 text-white/60'
                }
              `}
            >
              <span className="text-lg">
                {field.state.value === 'public' ? '🌐' : '🔒'}
              </span>
              <span className="flex-1 text-left">
                <span className="block text-sm font-semibold">
                  {field.state.value === 'public' ? 'Public' : 'Private'}
                </span>
                <span className="block text-xs opacity-60">
                  {field.state.value === 'public'
                    ? 'Visible to everyone in the library'
                    : 'Only visible to you'}
                </span>
              </span>
              {/* Toggle pill */}
              <input
                type="checkbox"
                checked={field.state.value === 'public'}
                onChange={(e) => {
                  field.handleChange(e.target.checked ? 'public' : 'private')
                }}
                className="toggle border-white bg-white/20 checked:border-green-800 checked:bg-green-500 text-white"
              />
            </button>
            {/* {field.state.value === 'public' && !isAdmin && (
              <p className="text-xs text-amber-400/80 flex items-center gap-1.5">
                ⚠️ Once public, only an admin can edit or make it private again.
              </p>
            )} */}
          </div>
        )}
      </form.Field>

      {/* Description */}
      <form.Field name="description">
        {(field) => (
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider text-white/50 font-medium">
              Description
            </label>
            <textarea
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              className="w-full bg-white/5 border border-white/20 rounded-lg p-3 text-white h-36 resize-y focus:outline-none focus:border-white/40 transition-colors"
              placeholder="Enter book description…"
            />
          </div>
        )}
      </form.Field>

      {/* Errors / Actions */}
      <form.Subscribe
        selector={(s) => ({
          canSubmit: s.canSubmit,
          isSubmitting: s.isSubmitting,
          errors: s.errors,
        })}
      >
        {({ canSubmit, isSubmitting, errors }) => (
          <>
            {errors.length > 0 && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                ⚠️ {errors.join(', ')}
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin inline-block">⏳</span>{' '}
                    Saving…
                  </>
                ) : (
                  '💾 Save Changes'
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </form.Subscribe>
    </form>
  )
}
