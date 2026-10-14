/**
 * Recompute the Trend Momentum Index for every entity.
 *
 *   pnpm analytics:refresh
 *
 * In production this runs after each ingestion pass, so the /trends surface is a
 * cheap read rather than an aggregation over the full observation table.
 */
import { getDbHandle } from '@/db/client';
import { refreshTrendScores } from '@/lib/analytics/refresh';

async function main() {
  const { db, driver } = await getDbHandle();
  console.log(`[sole-index] refreshing trend scores via ${driver}`);

  const report = await refreshTrendScores(db);
  console.log('\n[sole-index] analytics refresh complete');
  console.log(`  as of        ${report.asOf}`);
  console.log(`  window       ${report.windowDays} days`);
  console.log(`  products     ${report.products}`);
  console.log(`  categories   ${report.categories}`);
  console.log(`  colors       ${report.colors}`);
  console.log(`  materials    ${report.materials}`);
  console.log(`  total        ${report.total}`);
  console.log(`  elapsed      ${report.elapsedMs}ms`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[sole-index] analytics refresh failed');
    console.error(error);
    process.exit(1);
  });
