/**
 * Database client.
 *
 * Two drivers, one schema, one `Db` type:
 *
 *  - `pglite`   : embedded PostgreSQL compiled to WASM, persisted to ./.data.
 *                 Zero setup. This is what `pnpm dev` uses, and what the demo
 *                 dataset is built on.
 *  - `postgres` : a real PostgreSQL server (Neon / Supabase / RDS). Selected by
 *                 setting DATABASE_URL and SOLEINDEX_DB_DRIVER=postgres.
 *
 * Both drivers implement the same `pg-core` query builder, so the repository
 * layer never knows which one is active. In a real deployment you would delete
 * the driver you do not use; keeping both here is what makes "runs locally with
 * no services, deploys to managed Postgres unchanged" demonstrable rather than
 * aspirational.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

/**
 * The single query-builder type used across the app. `PgliteDatabase` is used as
 * the canonical shape because both drivers expose the identical pg-core API; the
 * postgres-js instance is cast below. See the module comment.
 */
export type Db = PgliteDatabase<typeof schema>;

export type DbDriver = 'pglite' | 'postgres';

export const DATA_DIR = process.env.SOLEINDEX_DATA_DIR ?? '.data';

export function activeDriver(): DbDriver {
  const raw = (process.env.SOLEINDEX_DB_DRIVER ?? 'pglite').toLowerCase();
  return raw === 'postgres' ? 'postgres' : 'pglite';
}

type Client = PGlite | ReturnType<typeof postgres>;

interface DbHandle {
  db: Db;
  driver: DbDriver;
  client: Client;
}

/**
 * Next.js dev server re-evaluates modules on every HMR pass. Caching the handle
 * on globalThis keeps a single PGlite instance (and a single WASM heap) alive
 * across reloads instead of leaking one per edit.
 */
const globalForDb = globalThis as unknown as {
  __soleIndexDb?: DbHandle;
  __soleIndexDbPromise?: Promise<DbHandle>;
};

async function createHandle(): Promise<DbHandle> {
  const driver = activeDriver();

  if (driver === 'postgres') {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'SOLEINDEX_DB_DRIVER=postgres requires DATABASE_URL to be set. ' +
          'Unset it to fall back to the embedded PGlite database.',
      );
    }
    // `prepare: false` keeps us compatible with transaction-pooling proxies
    // (Neon, Supavisor, PgBouncer).
    const client = postgres(url, { max: 4, prepare: false });
    const db = drizzlePostgres(client, { schema }) as unknown as Db;
    return { db, driver, client };
  }

  // PGlite does not create intermediate directories, so make sure the data
  // directory exists before the WASM heap tries to open its files.
  const dataDir = resolve(process.cwd(), DATA_DIR, 'pg');
  mkdirSync(dataDir, { recursive: true });

  const client = new PGlite(dataDir);
  await client.waitReady;
  const db = drizzlePglite(client, { schema });
  return { db, driver, client };
}

/** Returns the cached handle, creating and warming it on first use. */
export function getDbHandle(): Promise<DbHandle> {
  if (globalForDb.__soleIndexDb) return Promise.resolve(globalForDb.__soleIndexDb);
  globalForDb.__soleIndexDbPromise ??= createHandle().then((handle) => {
    globalForDb.__soleIndexDb = handle;
    return handle;
  });
  return globalForDb.__soleIndexDbPromise;
}

/** Convenience accessor for the query builder. */
export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}

export { schema };
