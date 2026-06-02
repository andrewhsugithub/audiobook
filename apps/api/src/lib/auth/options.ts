import type { BetterAuthOptions } from "better-auth";
import { admin, bearer } from "better-auth/plugins";

export const betterAuthOptions = {
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // flip to true in production
  },

  plugins: [
    // Allows Authorization: Bearer <token> in addition to session cookies.
    // Useful for mobile clients and the HLS middleware which uses its own cookie.
    bearer(),
    admin(),
  ],

  user: {
    additionalFields: {
      // Explicitly tell Better-Auth that role returns a non-nullable type union
      role: {
        type: "string",
        required: true,
        defaultValue: "user", // Automatically guarantees the value won't be undefined or null
      },
    },
  },

  // Populate session with the user object so we don't need a second DB round-trip
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Slide window daily on activity
  },
} satisfies BetterAuthOptions;
