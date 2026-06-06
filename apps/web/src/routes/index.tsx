import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import BookCarousel from '../components/BookCarousel'
import ThemeToggle from '../components/ThemeToggle'
import { useInfiniteSearch } from '../hooks/useSearch'
import { useLibrary } from '../hooks/useLibrary'
import { useAuth } from '../hooks/useAuth'
import { signOut } from '../lib/auth'
import { useQueryClient } from '@tanstack/react-query'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Audiobook · Home' }] }),
  component: App,
})

function CarouselSkeleton() {
  return (
    <div className="mt-14">
      <div className="mb-6 h-8 w-56 animate-pulse rounded bg-[var(--line)]" />
      <div className="flex gap-15 overflow-hidden px-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-[160px] shrink-0 animate-pulse">
            <div className="aspect-[2/3] w-full rounded bg-[var(--line)]" />
            <div className="mt-3 h-4 w-3/4 rounded bg-[var(--line)]" />
            <div className="mt-2 h-3 w-1/2 rounded bg-[var(--line)]" />
          </div>
        ))}
      </div>
    </div>
  )
}

function App() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { isLoggedIn, user, isPending } = useAuth()

  const {
    data: searchData,
    isLoading: isSearchLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteSearch({ limit: 10, sort: 'recent' })

  // Library is only fetched when logged in — keep its loading state separate
  const { data: libraryData, isLoading: isLibraryLoading } =
    useLibrary(isLoggedIn)

  const trendingBookIds =
    searchData?.pages.flatMap((p) => p.results.map((b) => b.id)) ?? []

  const savedBookIds = (libraryData?.results ?? []).map(
    (b: { id: string }) => b.id,
  )

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed', err)
    } finally {
      // Clear the query cache. This destroys all cached data in RAM,
      // resets states, and triggers automatic refetches for any remaining active queries.
      queryClient.clear()

      navigate({ to: '/' })
    }
  }

  return (
    <div className="min-w-[500px] page-wrap rise-in py-10 h-full">
      {/* ── Header ── */}
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="island-kicker mb-2">Audiobook Platform</p>
          <h1 className="display-title text-6xl font-bold">Audiobook</h1>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-nowrap items-center gap-3">
            {!isPending && isLoggedIn && (
              <span className="min-w-0 max-w-[10rem] truncate text-sm font-medium opacity-70">
                {user?.name || user?.email}
              </span>
            )}
            {!isPending &&
              (isLoggedIn ? (
                <button
                  onClick={handleSignOut}
                  className="btn btn-sm btn-outline"
                >
                  Sign Out
                </button>
              ) : (
                <Link className="btn btn-sm btn-primary" to="/sign-in">
                  Sign In
                </Link>
              ))}
            <ThemeToggle />
          </div>

          <div className="flex flex-nowrap items-center gap-3">
            <Link className="btn btn-sm btn-soft" to="/library">
              Browse
            </Link>
            {!isPending && isLoggedIn && (
              <Link to="/upload" className="btn btn-sm btn-primary">
                + Upload
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Hero Banners ── */}
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

      {/* ── Trending Carousel — has its own independent loading state ── */}
      {isSearchLoading ? (
        <CarouselSkeleton />
      ) : trendingBookIds.length > 0 ? (
        <BookCarousel
          title="New & Trending"
          bookIds={trendingBookIds}
          linkTo="/library"
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      ) : (
        <p className="mt-14 text-sm opacity-50">
          No audiobooks yet. Upload one to get started.
        </p>
      )}

      {/* ── My Books Carousel — only renders when logged in ── */}
      {isLoggedIn &&
        (isLibraryLoading ? (
          <CarouselSkeleton />
        ) : savedBookIds.length >= 0 ? (
          <BookCarousel
            title="My Books"
            bookIds={savedBookIds}
            linkTo="/my-books"
          />
        ) : null)}
    </div>
  )
}
