/**
 * Manual migration entrypoint: `pnpm db:migrate`.
 *
 * The app also migrates itself on first request (src/db/bootstrap.ts), so this
 * exists for CI and for operators who want migrations to be an explicit step.
 */
import { resolve } from 'node:path';

import { migrate } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';

import { activeDriver, getDbHandle } from './client';

async function main() {
  const { db, driver } = await getDbHandle();
  const started = Date.now();
  const migrationsFolder = resolve(process.cwd(), 'drizzle');

  if (driver === 'postgres') {
    await migratePostgres(db as never, { migrationsFolder });
  } else {
    await migrate(db, { migrationsFolder });
  }
  void activeDriver;

  console.log(
    `[sole-index] migrations applied via ${driver} in ${Date.now() - started}ms`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error('[sole-index] migration failed');
  console.error(error);
  process.exit(1);
});
