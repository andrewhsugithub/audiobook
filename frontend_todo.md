# Frontend Improvement Plan — `apps/web`

A prioritized, actionable plan to improve the audiobook web app (React 19 + TanStack
Router/Query + Tailwind v4 + Vite). Items are grouped by phase; each links to the
relevant file. Check items off as you go.

Stack recap: TanStack Router (file-based, auto code-split), TanStack Query for data,
TanStack Form for the upload form, Tailwind v4 (CSS-variable theme in
[styles.css](apps/web/src/styles.css)), HLS playback via `@videojs/react`.

---

## Phase 0 — Quick wins & cleanup (low risk, do first)

- [ ] **Delete stale commented code blocks.** Large dead blocks rot the codebase:
  - [Header.tsx](apps/web/src/components/Header.tsx#L13-L94) (~80 lines of an old header)
  - [BookCarousel.tsx](apps/web/src/components/BookCarousel.tsx#L108-L138) (old carousel impl)
  - [BookCard.tsx](apps/web/src/components/BookCard.tsx#L92-L96) (commented rating)
  - [HlsAudio.tsx](apps/web/src/components/HlsAudio.tsx#L20) (commented `<Audio>` + unused import)
- [ ] **Remove unused imports.** e.g. `FaUpload`/`HiUpload` in
  [UploadButton.tsx](apps/web/src/components/UploadButton.tsx#L2); the unused `Audio`
  import in HlsAudio; `createStarString` in BookCard if rating stays removed.
- [ ] **Remove the placeholder footer credit** "Your name here" in
  [Footer.tsx](apps/web/src/components/Footer.tsx#L8) and replace the TanStack template
  links with project-appropriate ones.
- [ ] **Remove unused state.** `uploadedBooks` in
  [library.tsx](apps/web/src/routes/library.tsx#L26) is set but never read;
  `saveSuccess` in [books.$bookId.tsx](apps/web/src/routes/books.$bookId.tsx#L29) is
  declared but never set (its refetch branch is dead code).
- [ ] **Run `pnpm check`** (`prettier --write . && eslint --fix`) and fix any lint errors
  after the cleanup above.

> Note: `bg-(--brand-charcoal)` / `text-(--panel-bg)` are **valid** Tailwind v4
> CSS-variable shorthand — do not "fix" them. `z-999` and `border-b-5` are arbitrary but
> work; only normalize them if you want design-system consistency.

---

## Phase 1 — Correctness & architecture

- [ ] **Wire up the homepage to real data.** [index.tsx](apps/web/src/routes/index.tsx#L96-L104)
  uses a hardcoded `bookIds` array with a `TODO`. Replace with a real query (e.g. a
  "trending"/"recent" endpoint, or reuse the search query with an empty term) and add
  loading/error states for each carousel.
- [ ] **Centralize the API base URL.** It's repeated as
  `import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'` in
  [queries.ts](apps/web/src/utils/queries.ts#L3),
  [useMultipartUpload.ts](apps/web/src/hooks/useMultipartUpload.ts#L3),
  [useHlsStream.ts](apps/web/src/hooks/useHlsStream.ts#L3), and
  [books.$bookId.tsx](apps/web/src/routes/books.$bookId.tsx#L17). Export a single
  `API_BASE_URL` from one module and import it everywhere. Add a committed
  `.env.example` documenting `VITE_API_BASE_URL`.
- [ ] **Replace hardcoded auth.** `isAdmin = true` and a hardcoded `userId` in
  [books.$bookId.tsx](apps/web/src/routes/books.$bookId.tsx#L23-L24) (and the `userId`
  passed to the upload flow) gate admin/edit features. Even a minimal auth context or
  env-gated flag is better than a literal `true` shipping to all users.
- [ ] **Add a root error boundary.** [__root.tsx](apps/web/src/routes/__root.tsx) has no
  `errorComponent`/`notFoundComponent`, so any thrown error white-screens the app. Add a
  branded error fallback and a 404 route.
- [ ] **De-duplicate `localStorage.getItem('myBooks')`.** Read once into a typed helper
  instead of the repeated calls in
  [books.$bookId.tsx](apps/web/src/routes/books.$bookId.tsx#L156-L182) and
  [library.tsx](apps/web/src/routes/library.tsx#L31-L39). Replace the `any[]` typing with
  a shared `MyBook` interface. (Longer term, consider moving "My Books" to backend
  persistence instead of localStorage.)
- [ ] **Reconcile `router.tsx` vs `main.tsx`.** [router.tsx](apps/web/src/router.tsx)
  exports `getRouter()` but [main.tsx](apps/web/src/main.tsx) creates its own
  `QueryClient`/router inline. Pick one source of truth so devtools and the query client
  share a single instance.

---

## Phase 2 — Accessibility (currently the weakest area)

- [ ] **Label every icon-only control.** Add `aria-label` (and visible focus styles):
  - Carousel arrows in [BookCarousel.tsx](apps/web/src/components/BookCarousel.tsx#L74-L88)
    (also set the real `disabled` attribute, not just a class).
  - Upload trigger in [UploadButton.tsx](apps/web/src/components/UploadButton.tsx#L11)
    (it's a `<label>` acting as a button with no accessible name).
  - Back button in [Header.tsx](apps/web/src/components/Header.tsx#L105).
  - Play/pause + seek slider in [AudioPlayer.tsx](apps/web/src/components/AudioPlayer.tsx#L40-L56).
- [ ] **Associate labels with form fields.** [UploadForm.tsx](apps/web/src/components/UploadForm.tsx)
  inputs (title, author, file, textarea) have no `<label>` / `aria-describedby`. Same for
  the search input in [SearchBar.tsx](apps/web/src/components/SearchBar.tsx#L12).
- [ ] **Make the upload progress bar accessible.** Add `role="progressbar"` +
  `aria-valuenow/min/max` in [UploadForm.tsx](apps/web/src/components/UploadForm.tsx#L183-L187).
- [ ] **Add a descriptive `aria-label` to [Rating.tsx](apps/web/src/components/Rating.tsx)**
  (e.g. "3.5 out of 5 stars") and guard against out-of-range values.
- [ ] **Run an a11y pass** (axe DevTools or the `web-perf` skill) and fix contrast/focus
  issues, especially in dark mode.

---

## Phase 3 — UX & feedback

- [ ] **Add a toast/notification system** for success & error feedback. Today errors are
  swallowed in empty catch blocks
  ([UploadForm.tsx](apps/web/src/components/UploadForm.tsx#L52-L54)) and metadata saves
  give no confirmation ([books.$bookId.tsx](apps/web/src/routes/books.$bookId.tsx#L120)).
- [ ] **Improve the library empty/no-results state.**
  [library.tsx](apps/web/src/routes/library.tsx#L137-L141) only shows a message when the
  user has typed something; add a friendly empty state for the default view and a
  distinct "no matches" state.
- [ ] **Add pagination or infinite scroll.** Search is capped at a hardcoded `limit: 50`
  ([queries.ts](apps/web/src/utils/queries.ts#L37)) with no way to page further.
- [ ] **Upload form polish:** drag-and-drop, client-side file-size/type validation, and an
  indeterminate state for the "initiating"/"completing" phases (progress currently caps at
  90% until the complete call returns —
  [useMultipartUpload.ts](apps/web/src/hooks/useMultipartUpload.ts)).
- [ ] **Align accepted file types.** [UploadButton.tsx](apps/web/src/components/UploadButton.tsx#L15)
  accepts only `application/pdf` while the form allows `.pdf,.txt`.
- [ ] **Add real audio playback** to [AudioPlayer.tsx](apps/web/src/components/AudioPlayer.tsx)
  (it's currently a mock `setInterval` timer) or remove it in favor of
  [HlsAudio.tsx](apps/web/src/components/HlsAudio.tsx), and give HlsAudio loading + error
  fallbacks for failed streams.
- [ ] **Wire up the theme toggle.** [ThemeToggle.tsx](apps/web/src/components/ThemeToggle.tsx)
  is implemented but only referenced in commented-out code in Header. Mount it in the
  header/footer so users can actually switch themes.

---

## Phase 4 — Robustness, performance & SEO

- [ ] **Add chunk-retry logic** to the multipart upload
  ([useMultipartUpload.ts](apps/web/src/hooks/useMultipartUpload.ts)) — one failed chunk
  currently fails the whole upload. Add `AbortController` cleanup on unmount for upload and
  HLS session fetches ([useHlsStream.ts](apps/web/src/hooks/useHlsStream.ts)).
- [ ] **Per-route `<title>`/meta** via TanStack Router's `head`/`meta` options for SEO and
  better tab titles (home, library, book detail, about).
- [ ] **Carousel correctness:** replace the `setTimeout(350)` scroll-state hack in
  [BookCarousel.tsx](apps/web/src/components/BookCarousel.tsx#L59) with a (debounced)
  scroll listener, and add keyboard navigation.
- [ ] **Memoize hot paths:** the star array in [Rating.tsx](apps/web/src/components/Rating.tsx)
  and book-card lists, to avoid unnecessary re-renders in carousels/grids.
- [ ] **Handle long durations** in [time.ts](apps/web/src/utils/time.ts) (currently assumes
  < 60 min; audiobooks are hours long — add `H:MM:SS`).
- [ ] **Loading skeletons:** add them to the home carousels, and make BookCard skeleton
  widths match final content to reduce layout shift
  ([BookCard.tsx](apps/web/src/components/BookCard.tsx#L61-L87)).
- [ ] **Run the `web-perf` skill** to baseline Core Web Vitals (LCP/INP/CLS) once the above
  is in place.

---

## Phase 5 — Testing & DX

- [ ] **Add component/hook tests.** Testing Library + Vitest are already configured but
  there appear to be no tests. Start with: `useSearch` debouncing, `useMultipartUpload`
  happy path + failure, `time.ts`/`createStarString.ts`, and the UploadForm flow.
- [ ] **Type the `'file' | 'text'` tab** as a union instead of a bare string in
  [UploadForm.tsx](apps/web/src/components/UploadForm.tsx#L87), and tighten other `any`s
  surfaced above.
- [ ] **Extract shared input/button styles** (form inputs in UploadForm, etc.) into Tailwind
  component classes or small primitives to cut duplication.

---

### Suggested order

Phase 0 → 1 → 2 in the first pass (cleanup + correctness + a11y give the biggest
return), then 3 → 4 → 5 for polish, robustness, and long-term maintainability.
