/**
 * Minimal stand-in for real authentication.
 *
 * TODO: replace with a real auth context/provider once accounts exist. Until
 * then, the current user and admin capability are driven by env vars so we
 * don't ship a hardcoded `isAdmin = true` to production.
 */

// Identifies the acting user for uploads / edits. Override per-environment
// with `VITE_DEV_USER_ID`.
export const CURRENT_USER_ID =
  import.meta.env.VITE_DEV_USER_ID || 'd6c5a7cc-2aa3-4fd7-e2d9-1ff91a3b254d'

// Admin (edit / reupload) features are gated behind an explicit flag. They are
// enabled in dev by default so local editing still works, but production must
// opt in with `VITE_ADMIN=true`.
export const IS_ADMIN =
  import.meta.env.VITE_ADMIN === 'true' || import.meta.env.DEV
