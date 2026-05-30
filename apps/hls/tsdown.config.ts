import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  clean: true,
  sourcemap: true,
  minify: false,

  // Ensure tsdown resolves workspace: packages
  //   noExternal: [
  //     "@audiobook/db",
  //     "@audiobook/storage",
  //     "@audiobook/shared-libs",
  //     // Also bundle their deps
  //     "drizzle-orm",
  //     "postgres",
  //     "@aws-sdk/client-s3",
  //     "@aws-sdk/s3-request-presigner",
  //     "zod",
  //   ],
  // so that your runner step doesn't require a node_modules folder at all.
  noExternal: [/.*/],
});
