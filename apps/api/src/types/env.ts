import type { AuthSession } from "@audiobook/shared-libs/types/index";

export type Env = {
  Bindings: Cloudflare.Env;
  Variables: {
    /** Populated by authMiddleware on protected routes */
    authSession: AuthSession;
  };
};
