/**
 * Single source of truth for the API base URL.
 *
 * Configured via the `VITE_API_BASE_URL` env var (see `.env.example` at the
 * repo root). Falls back to the local Worker dev server.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'
