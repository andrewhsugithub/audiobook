export const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
] as const;

export type AllowedOrigin = (typeof ALLOWED_ORIGINS)[number];
