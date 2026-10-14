/**
 * Runtime bootstrap: migrate on first use.
 *
 * A fresh clone has no database. Rather than making the reader run a sequence of
 * CLI commands before anything renders, the first data access applies the
 * committed migrations and (if the catalogue is empty) loads the fixture
 * dataset. `pnpm db:reset` still exists for a clean rebuild, and production
 * deployments can run `pnpm db:migrate` as an explicit release step — this is a
 * convenience, not a requirement.
 */
import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';

import { activeDriver, getDbHandle, type Db } from './client';
import { products } from './schema';

const globalForBootstrap = globalThis as unknown as {
  __soleIndexBootstrap?: Promise<void>;
};

export function ensureDatabaseReady(): Promise<void> {
  globalForBootstrap.__soleIndexBootstrap ??= bootstrap().catch((error) => {
    // Reset so a transient failure (e.g. a cold PGlite start) can be retried
    // instead of poisoning the process for its whole lifetime.
    globalForBootstrap.__soleIndexBootstrap = undefined;
    throw error;
  });
  return globalForBootstrap.__soleIndexBootstrap;
}

async function bootstrap(): Promise<void> {
  const { db, driver } = await getDbHandle();

  await applyMigrations(db, driver);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products);

  if ((row?.count ?? 0) === 0) {
    const { seedDatabase } = await import('./seed');
    await seedDatabase(db);
  }
}

async function applyMigrations(db: Db, driver: string): Promise<void> {
  // Resolve against the project root so the path is stable whether we are
  // running `next dev`, `next start`, or a standalone script.
  const folder = resolve(process.cwd(), 'drizzle');
  if (driver === 'postgres') {
    await migratePostgres(db as never, { migrationsFolder: folder });
  } else {
    await migrate(db, { migrationsFolder: folder });
  }
  void activeDriver;
}
