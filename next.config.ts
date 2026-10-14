import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of PostgreSQL. It must stay external so Next does not
  // try to bundle or tree-shake the .wasm asset out of the server runtime.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],

  // The data layer is requested at runtime, never at build time. Pages opt in to
  // dynamic rendering (see `export const dynamic` in each route) so `next build`
  // stays a pure compile step and never needs a database.
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
