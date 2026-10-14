/**
 * Ingestion.
 *
 *   pnpm ingest                      # pull from the configured provider into the database
 *   pnpm ingest --provider kicksdb   # force a specific provider
 *   pnpm ingest --dry-run            # fetch and decode, write nothing
 *   pnpm ingest --limit 20           # cap the number of products
 *
 * This is the script a cron entry would call in production. It is also the
 * demonstration that the provider abstraction is real rather than decorative:
 * the same code path ingests the committed snapshot or a live KicksDB account,
 * and writes the same normalised rows either way.
 *
 * Every run is recorded in `ingestion_runs` — including failures, because a
 * failing run is the most useful row in that table.
 */
import { eq, sql } from 'drizzle-orm';

import { getDbHandle } from '@/db/client';
import { ingestionRuns, pricePoints, products, salesPoints } from '@/db/schema';
import { execute } from '@/lib/data/query';
import { activeProviderId, getProvider, type ProviderId } from '@/lib/providers';

const CHUNK = 500;

interface Options {
  providerId: ProviderId;
  dryRun: boolean;
  limit: number | null;
}

/**
 * Accepts both `--limit=3` and `--limit 3`.
 *
 * The space form was silently ignored in the first version, which is the worst
 * kind of CLI bug: the command appears to work and quietly does something else.
 */
function flagValue(argv: string[], name: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0 && index + 1 < argv.length) {
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) return next;
  }
  return undefined;
}

function parseArgs(argv: string[]): Options {
  const providerArg = flagValue(argv, '--provider');
  const limitArg = flagValue(argv, '--limit');
  const limit = limitArg ? Number(limitArg) : null;
  return {
    providerId: (providerArg === 'kicksdb' || providerArg === 'fixture'
      ? providerArg
      : activeProviderId()) as ProviderId,
    dryRun: argv.includes('--dry-run'),
    limit: limit !== null && Number.isFinite(limit) && limit > 0 ? limit : null,
  };
}

async function chunked<T>(rows: T[], fn: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const provider = getProvider(options.providerId);
  const startedAt = new Date().toISOString();
  const runId = `run-${Date.now().toString(36)}`;

  console.log(`[sole-index] ingest`);
  console.log(`  provider    ${provider.id} (${provider.label})`);
  console.log(`  driver      ${(process.env.SOLEINDEX_DB_DRIVER ?? 'pglite').toLowerCase()}`);
  console.log(`  capabilities ${JSON.stringify(provider.capabilities)}`);
  console.log(`  mode        ${options.dryRun ? 'DRY RUN — nothing will be written' : 'write'}`);

  if (!provider.capabilities.priceHistory) {
    console.warn('  warning     provider does not report price history');
  }

  const { db } = await getDbHandle();

  if (!options.dryRun) {
    await db
      .insert(ingestionRuns)
      .values({ id: runId, provider: provider.id, status: 'running', startedAt })
      .onConflictDoNothing();
  }

  let productsUpserted = 0;
  let pricePointsUpserted = 0;
  let failures = 0;

  try {
    console.log('\n  searching catalogue…');
    const found = await provider.searchProducts('', { limit: options.limit ?? 1000 });
    console.log(`  found       ${found.length} products`);

    if (options.dryRun) {
      // Print a decoded sample so a response mapping can be confirmed against a
      // live plan without writing anything.
      console.log('\n  first decoded record:');
      console.log(JSON.stringify(found[0] ?? null, null, 2).split('\n').slice(0, 40).join('\n'));
      const quota = provider.getQuota?.();
      if (quota) console.log(`\n  quota       ${JSON.stringify(quota)}`);
      console.log('\n[sole-index] dry run complete, nothing written');
      process.exit(0);
    }

    for (const record of found) {
      // A live provider can return shapes we cannot map; skip and count rather
      // than aborting the whole run on one malformed record.
      try {
        await db
          .insert(products)
          .values({
            id: record.id,
            slug: record.slug,
            name: record.name,
            brandId: record.brandId,
            categoryId: record.categoryId,
            silhouette: record.silhouette,
            colorway: record.colorway,
            primaryColor: record.primaryColor,
            secondaryColor: record.secondaryColor,
            materials: record.materials,
            releaseDate: record.releaseDate,
            retailPriceCents: record.retailPriceCents,
            currency: record.currency,
            imageUrl: record.imageUrl,
            description: record.description,
            updatedAt: new Date().toISOString(),
          })
          // Idempotent upsert: re-running ingestion refreshes rather than duplicates.
          .onConflictDoUpdate({
            target: products.id,
            set: {
              name: sql`excluded.name`,
              retailPriceCents: sql`excluded.retail_price_cents`,
              materials: sql`excluded.materials`,
              imageUrl: sql`excluded.image_url`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
        productsUpserted += 1;

        const [prices, sales] = await Promise.all([
          provider.getPriceHistory(record.id),
          provider.getSalesHistory(record.id),
        ]);

        await chunked(prices, (batch) =>
          db
            .insert(pricePoints)
            .values(
              batch.map((p) => ({
                id: `${p.productId}:${p.platformId}:${p.date}`,
                productId: p.productId,
                platformId: p.platformId,
                date: p.date,
                lowestAskCents: p.lowestAskCents,
                highestBidCents: p.highestBidCents,
                lastSaleCents: p.lastSaleCents,
              })),
            )
            .onConflictDoNothing(),
        );
        pricePointsUpserted += prices.length;

        // `activeListings === -1` is the provider's explicit "not reported"
        // marker (see the KicksDB adapter). Writing 0 would corrupt the
        // sell-through factor, so those rows are dropped instead.
        const usableSales = sales.filter((s) => s.activeListings >= 0);
        await chunked(usableSales, (batch) =>
          db
            .insert(salesPoints)
            .values(
              batch.map((s) => ({
                id: `${s.productId}:${s.platformId}:${s.date}`,
                productId: s.productId,
                platformId: s.platformId,
                date: s.date,
                volume: s.volume,
                avgSaleCents: s.avgSaleCents,
                activeListings: s.activeListings,
              })),
            )
            .onConflictDoNothing(),
        );
      } catch (error) {
        failures += 1;
        console.warn(`  skipped ${record.id}: ${(error as Error).message}`);
      }
    }

    const quota = provider.getQuota?.() ?? null;
    const durationMs = Date.now() - Date.parse(startedAt);

    await db
      .update(ingestionRuns)
      .set({
        status: failures > 0 && productsUpserted === 0 ? 'failed' : 'success',
        finishedAt: new Date().toISOString(),
        productsUpserted,
        pricePointsUpserted,
        durationMs,
        quota: quota as Record<string, number | string> | null,
        error: failures > 0 ? `${failures} record(s) skipped; see the ingest log.` : null,
      })
      .where(eq(ingestionRuns.id, runId));

    const counts = await execute<{ products: number; prices: number }>(db, sql`
      select (select count(*)::int from products) as "products",
             (select count(*)::int from price_points) as "prices"
    `);

    console.log('\n[sole-index] ingest complete');
    console.log(`  products upserted     ${productsUpserted}`);
    console.log(`  price points added    ${pricePointsUpserted}`);
    console.log(`  skipped               ${failures}`);
    console.log(`  duration              ${durationMs}ms`);
    console.log(`  totals now            ${JSON.stringify(counts.rows[0])}`);
    if (quota) console.log(`  quota                 ${JSON.stringify(quota)}`);
    console.log('\n  next: pnpm analytics:refresh');
  } catch (error) {
    if (!options.dryRun) {
      await db
        .update(ingestionRuns)
        .set({
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: (error as Error).message,
          durationMs: Date.now() - Date.parse(startedAt),
        })
        .where(eq(ingestionRuns.id, runId))
        .catch(() => undefined);
    }
    throw error;
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('[sole-index] ingest failed');
  console.error(error);
  process.exit(1);
});
