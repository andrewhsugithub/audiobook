import { createFileRoute, Link } from '@tanstack/react-router'
import BookCarousel from '../components/BookCarousel'
import ThemeToggle from '../components/ThemeToggle'
import { useSearch } from '../hooks/useSearch'
import { searchQuery } from '../utils/queries'
import { getMyBooks } from '../utils/myBooks'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Audiobook · Home' }] }),
  // Prefetch the default (empty = recent) search so the trending row is warm.
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(searchQuery(''))
  },
  component: App,
})

function App() {
  // Trending = the default recent-books search. "My Books" = local library.
  const { data: searchData, isLoading } = useSearch('')
  const trendingBookIds = (searchData?.results ?? []).map((b) => b.id)
  const myBookIds = getMyBooks().map((b) => b.id)

  return (
    <div className="min-w-[500px] page-wrap rise-in py-10">
      {/* Header */}
      <div className="mb-10 flex items-center justify-between">
        <div>
          <p className="island-kicker mb-2">Audiobook Platform</p>

          <h1 className="display-title text-6xl font-bold">Audiobook</h1>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link className="island-shell rounded-full px-5 py-3" to="/library">
            Browse
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="feature-card rounded-[32px] border p-8">
          <p className="island-kicker mb-3">Featured Collection</p>

          <h2 className="display-title mb-4 text-4xl font-bold">
            Summer's Biggest Audiobooks
          </h2>

          <p className="text-[var(--sea-ink-soft)]">
            Discover trending audiobooks selected for this season.
          </p>
        </div>

        <div className="feature-card rounded-[32px] border p-8">
          <p className="island-kicker mb-3">Staff Picks</p>

          <h2 className="display-title mb-4 text-4xl font-bold">
            Top 25 True Stories
          </h2>

          <p className="text-[var(--sea-ink-soft)]">
            Hand-picked stories and inspiring real experiences.
          </p>
        </div>
      </div>

      {/* Sections */}
      {isLoading ? (
        <div className="mt-14">
          <div className="mb-6 h-8 w-56 animate-pulse rounded bg-white/10" />
          <div className="flex gap-15 overflow-hidden px-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-[160px] shrink-0 animate-pulse">
                <div className="aspect-[2/3] w-full rounded bg-white/5" />
                <div className="mt-3 h-4 w-3/4 rounded bg-white/10" />
                <div className="mt-2 h-3 w-1/2 rounded bg-white/5" />
              </div>
            ))}
          </div>
        </div>
      ) : trendingBookIds.length > 0 ? (
        <BookCarousel
          title="New & Trending"
          bookIds={trendingBookIds}
          linkTo="/library"
        />
      ) : (
        <p className="mt-14 text-sm opacity-50">
          No audiobooks yet. Upload one to get started.
        </p>
      )}

      {myBookIds.length > 0 && (
        <BookCarousel title="My Books" bookIds={myBookIds} linkTo="/library" />
      )}
    </div>
  )
}
