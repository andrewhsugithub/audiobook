import { createFileRoute, Link } from '@tanstack/react-router'
import BookCarousel from '../components/BookCarousel'

export const Route = createFileRoute('/')({ component: App })

// function App() {
//   return (
//     <main className="page-wrap px-4 pb-8 pt-14">
//       <section className="island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
//         <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.32),transparent_66%)]" />
//         <div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(47,106,74,0.18),transparent_66%)]" />
//         <p className="island-kicker mb-3">TanStack Start Base Template</p>
//         <h1 className="display-title mb-5 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight text-[var(--sea-ink)] sm:text-6xl">
//           Start simple, ship quickly.
//         </h1>
//         <p className="mb-8 max-w-2xl text-base text-[var(--sea-ink-soft)] sm:text-lg">
//           This base starter intentionally keeps things light: two routes, clean
//           structure, and the essentials you need to build from scratch.
//         </p>
//         <div className="flex flex-wrap gap-3">
//           <a
//             href="/about"
//             className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] no-underline transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)]"
//           >
//             About This Starter
//           </a>
//           <a
//             href="https://tanstack.com/router"
//             target="_blank"
//             rel="noopener noreferrer"
//             className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-5 py-2.5 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)]"
//           >
//             Router Guide
//           </a>
//           <a
//             href="/library"
//             className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] no-underline transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)]"
//           >
//             Library
//           </a>
//         </div>
//       </section>

//       <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
//         {[
//           [
//             'Type-Safe Routing',
//             'Routes and links stay in sync across every page.',
//           ],
//           [
//             'Server Functions',
//             'Call server code from your UI without creating API boilerplate.',
//           ],
//           [
//             'Streaming by Default',
//             'Ship progressively rendered responses for faster experiences.',
//           ],
//           [
//             'Tailwind Native',
//             'Design quickly with utility-first styling and reusable tokens.',
//           ],
//         ].map(([title, desc], index) => (
//           <article
//             key={title}
//             className="island-shell feature-card rise-in rounded-2xl p-5"
//             style={{ animationDelay: `${index * 90 + 80}ms` }}
//           >
//             <h2 className="mb-2 text-base font-semibold text-[var(--sea-ink)]">
//               {title}
//             </h2>
//             <p className="m-0 text-sm text-[var(--sea-ink-soft)]">{desc}</p>
//           </article>
//         ))}
//       </section>

//       <section className="island-shell mt-8 rounded-2xl p-6">
//         <p className="island-kicker mb-2">Quick Start</p>
//         <ul className="m-0 list-disc space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
//           <li>
//             Edit <code>src/routes/index.tsx</code> to customize the home page.
//           </li>
//           <li>
//             Update <code>src/components/Header.tsx</code> and{' '}
//             <code>src/components/Footer.tsx</code> for brand links.
//           </li>
//           <li>
//             Add routes in <code>src/routes</code> and tweak visual tokens in{' '}
//             <code>src/styles.css</code>.
//           </li>
//         </ul>
//       </section>
//     </main>
//   )
// }

const bookIds = [
  '53a6c3f9-987c-4fbf-b332-2f796df1181d',
  '1a476490-7c55-4259-821d-db1d3d0b582a',
  'a83d9366-36db-4d14-a48b-805cc299bdaf',
]

const trendingBookIds = bookIds
const myBookIds = bookIds.slice(0, 1)

function App() {
  return (
    <div className="min-w-[500px] page-wrap rise-in py-10">
      {/* Header */}
      <div className="mb-10 flex items-center justify-between">
        <div>
          <p className="island-kicker mb-2">Audiobook Platform</p>

          <h1 className="display-title text-6xl font-bold">Audiobook</h1>
        </div>

        <Link className="island-shell rounded-full px-5 py-3" to="/library">
          Browse
        </Link>
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
      <BookCarousel
        title="New & Trending"
        bookIds={trendingBookIds}
        linkTo="/library"
      />

      <BookCarousel title="My Books" bookIds={myBookIds} linkTo="/library" />
    </div>
  )
}
