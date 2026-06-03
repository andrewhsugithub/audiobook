import { createMiddleware } from "hono/factory";
import type { Env } from "../types/env";
import { createAuth } from "../lib/auth";

/**
 * Attaches the better-auth instance to the Hono context once per request,
 * then validates the session and exposes `c.var.authSession`.
 *
 * Apply to any route that requires an authenticated user.
 */
type TargetAuthSession = Env["Variables"]["authSession"];
export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: "Authentication required" }, 401);
  }

  c.set("authSession", session as unknown as TargetAuthSession);
  await next();
});

/**
 * Mounts the better-auth request handler so it can respond to all
 * /api/auth/* routes (sign-in, sign-up, session, etc.)
 */
export function mountAuthRoutes(env: Cloudflare.Env) {
  return (req: Request) => createAuth(env).handler(req);
}
