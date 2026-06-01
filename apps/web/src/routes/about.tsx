import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  head: () => ({ meta: [{ title: 'About · Audiobook' }] }),
  component: About,
})

function About() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">About</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Turn any book into audio.
        </h1>
        <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          Upload a PDF or paste text and we parse it, assign a distinct voice to
          each speaker, synthesize multi-voice narration, and stream it back to
          you as an audiobook — right in your browser.
        </p>
      </section>
    </main>
  )
}
