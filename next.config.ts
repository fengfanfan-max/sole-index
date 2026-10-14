import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of PostgreSQL. It must stay external so Next does not
  // try to bundle or tree-shake the .wasm asset out of the server runtime.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],

  /**
   * Force the PGlite WASM assets into the traced server bundle.
   *
   * `serverExternalPackages` keeps the package out of the bundle, which is what we
   * want — but PGlite locates its `.wasm` and `.data` files through a *runtime*
   * filesystem path relative to `import.meta.url`. Next's file tracing cannot see
   * through a dynamic path, so on a platform that packages only the traced files
   * (Vercel) the assets can be left behind and every request fails with a
   * missing-file error at import time. Declaring them here makes the dependency
   * explicit instead of relying on tracing to guess correctly.
   *
   * Verified locally: with this in place a production server started against an
   * empty data directory boots, migrates, seeds and renders in ~4s.
   */
  outputFileTracingIncludes: {
    '/**/*': ['./node_modules/@electric-sql/pglite/dist/**/*'],
  },

  // The data layer is requested at runtime, never at build time. Pages opt in to
  // dynamic rendering (see `export const dynamic` in each route) so `next build`
  // stays a pure compile step and never needs a database.
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
