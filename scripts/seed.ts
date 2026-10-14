/**
 * CLI entrypoints for the database.
 *
 *   pnpm db:seed     migrate (if needed) then load the fixture dataset
 *   pnpm db:reset    drop ./.data and rebuild from scratch
 *
 * The app also bootstraps itself on first request (src/db/bootstrap.ts); this
 * exists so CI and operators have an explicit, reportable step.
 */
import { resolve } from 'node:path';

import { ensureDatabaseReady } from '@/db/bootstrap';
import { getDbHandle } from '@/db/client';
import { seedDatabase } from '@/db/seed';

async function main() {
  const args = process.argv.slice(2);
  const skipAnalytics = args.includes('--skip-analytics');
  const { driver } = await getDbHandle();

  console.log(`[sole-index] seeding via ${driver} (${resolve(process.cwd(), '.data')})`);

  // Applies migrations and seeds only if the catalogue is empty.
  await ensureDatabaseReady();

  // Then force a full idempotent load, so this command is meaningful even on a
  // database that already has rows.
  const { db } = await getDbHandle();
  const report = await seedDatabase(db, {
    skipAnalytics,
    onProgress: (message) => console.log(`[sole-index]   ${message}`),
  });

  const pad = (label: string) => label.padEnd(20);
  console.log('\n[sole-index] seed complete');
  for (const [key, value] of Object.entries(report)) {
    if (key === 'elapsedMs') continue;
    console.log(`  ${pad(key)} ${value}`);
  }
  console.log(`  ${pad('elapsed')} ${report.elapsedMs}ms`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[sole-index] seed failed');
    console.error(error);
    process.exit(1);
  });
