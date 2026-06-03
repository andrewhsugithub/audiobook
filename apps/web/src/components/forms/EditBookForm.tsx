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
      className="space-y-5"
    >
      <p className="island-kicker">Edit details</p>

      {/* Title */}
      <form.Field name="title">
        {(field) => (
          <div className="space-y-1.5">
            <label htmlFor={field.name} className="field-label">
              Title
            </label>
            <input
              id={field.name}
              type="text"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              className="field-input text-xl font-bold"
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-sm text-error">
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
          <div className="space-y-1.5">
            <label htmlFor={field.name} className="field-label">
              Author
            </label>
            <input
              id={field.name}
              type="text"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              className="field-input uppercase"
            />
          </div>
        )}
      </form.Field>

      {/* Rating */}
      <form.Field name="ratings">
        {(field) => (
          <div className="space-y-1.5">
            <label htmlFor={field.name} className="field-label">
              Rating — {field.state.value.toFixed(1)} / 5
            </label>
            <input
              id={field.name}
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={field.state.value}
              onChange={(e) =>
                field.handleChange(parseFloat(e.target.value) || 0)
              }
              className="range range-primary range-sm w-full"
            />
          </div>
        )}
      </form.Field>

      {/* Visibility */}
      <form.Field name="visibility">
        {(field) => {
          const isPublic = field.state.value === 'public'
          return (
            <div className="space-y-1.5">
              <span className="field-label">Visibility</span>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 transition-colors hover:border-[var(--lagoon)]">
                <span className="flex items-center gap-3">
                  <span className="text-lg">{isPublic ? '🌐' : '🔒'}</span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--sea-ink)]">
                      {isPublic ? 'Public' : 'Private'}
                    </span>
                    <span className="block text-xs text-[var(--sea-ink-soft)]">
                      {isPublic
                        ? 'Visible to everyone in the library'
                        : 'Only visible to you'}
                    </span>
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) =>
                    field.handleChange(e.target.checked ? 'public' : 'private')
                  }
                  className="toggle toggle-primary"
                  aria-label="Toggle public visibility"
                />
              </label>
            </div>
          )
        }}
      </form.Field>

      {/* Description */}
      <form.Field name="description">
        {(field) => (
          <div className="space-y-1.5">
            <label htmlFor={field.name} className="field-label">
              Description
            </label>
            <textarea
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              className="field-input h-36 resize-y"
              placeholder="Enter book description…"
            />
          </div>
        )}
      </form.Field>

      {/* Actions — field-level messages above already surface validation errors */}
      <form.Subscribe
        selector={(s) => ({
          canSubmit: s.canSubmit,
          isSubmitting: s.isSubmitting,
        })}
      >
        {({ canSubmit, isSubmitting }) => (
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn btn-primary flex-1"
            >
              {isSubmitting ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
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
              className="btn btn-ghost"
            >
              Cancel
            </button>
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}
