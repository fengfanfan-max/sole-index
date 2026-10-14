import { defineConfig } from 'drizzle-kit';

/**
 * `drizzle-kit generate` emits versioned SQL into ./drizzle. Those files are
 * committed and applied at runtime by src/db/bootstrap.ts, which means a fresh
 * clone only ever needs `pnpm install && pnpm dev`.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://soleindex:soleindex@localhost:5432/soleindex',
  },
});
