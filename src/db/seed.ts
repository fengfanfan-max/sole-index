/**
 * Fixture loader — the only module that writes the demo dataset into Postgres.
 *
 * Design notes:
 *
 *  - **Idempotent.** Every insert uses `ON CONFLICT DO NOTHING`, so re-running
 *    the seeder is safe and a partially-seeded database heals rather than
 *    duplicating.
 *  - **Batched.** ~47,000 rows go in 500-row statements. Row-at-a-time inserts
 *    over a WASM PostgreSQL are roughly two orders of magnitude slower.
 *  - **Ordered.** Static reference data, then the catalogue, then observations,
 *    then knowledge, then derived analytics — so a failure halfway leaves a
 *    consistent prefix rather than orphans.
 */
import { sql } from 'drizzle-orm';

import { refreshTrendScores } from '@/lib/analytics/refresh';
import { loadSnapshot, materializeSnapshotAsync } from '@/lib/providers/fixture';

import type { Db } from './client';
import * as schema from './schema';
import { execute } from '@/lib/data/query';

export interface SeedReport {
  users: number;
  brands: number;
  categories: number;
  platforms: number;
  products: number;
  pricePoints: number;
  salesPoints: number;
  attributeTrends: number;
  sources: number;
  insights: number;
  insightLinks: number;
  articles: number;
  ingestionRuns: number;
  featureFlags: number;
  subscriptions: number;
  trendScores: number;
  elapsedMs: number;
}

/** Rows per INSERT statement. Tuned against PGlite; safe for network Postgres. */
const CHUNK_SIZE = 500;

async function insertChunked<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<number> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await insert(rows.slice(i, i + CHUNK_SIZE));
  }
  return rows.length;
}

export interface SeedOptions {
  /** Skip the TMI recomputation. Useful when only catalogue data changed. */
  skipAnalytics?: boolean;
  onProgress?: (message: string) => void;
}

export async function seedDatabase(db: Db, options: SeedOptions = {}): Promise<SeedReport> {
  const started = Date.now();
  const log = options.onProgress ?? (() => {});
  const snapshot = loadSnapshot();
  const { manifest, catalog, editorial, ops, attributeTrends } = snapshot;

  /* ------------------------------ reference ------------------------------ */

  const users = await insertChunked(editorial.users, (chunk) =>
    db
      .insert(schema.users)
      .values(
        chunk.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          tier: u.tier,
        })),
      )
      .onConflictDoNothing(),
  );

  const brands = await insertChunked(catalog.brands, (chunk) =>
    db.insert(schema.brands).values(chunk).onConflictDoNothing(),
  );

  const categories = await insertChunked(catalog.categories, (chunk) =>
    db
      .insert(schema.categories)
      .values(chunk.map((c) => ({ ...c, description: c.description ?? null })))
      .onConflictDoNothing(),
  );

  const platforms = await insertChunked(catalog.platforms, (chunk) =>
    db.insert(schema.platforms).values(chunk).onConflictDoNothing(),
  );

  /* ------------------------------ catalogue ------------------------------ */

  const products = await insertChunked(catalog.products, (chunk) =>
    db
      .insert(schema.products)
      .values(
        chunk.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          brandId: p.brandId,
          categoryId: p.categoryId,
          silhouette: p.silhouette,
          colorway: p.colorway,
          primaryColor: p.primaryColor,
          secondaryColor: p.secondaryColor,
          materials: p.materials,
          releaseDate: p.releaseDate,
          retailPriceCents: p.retailPriceCents,
          currency: p.currency,
          imageUrl: p.imageUrl,
          description: p.description,
        })),
      )
      .onConflictDoNothing(),
  );

  log(`catalogue: ${products} products`);

  /* ----------------------------- observations ---------------------------- */

  const { priceObservations, salesObservations } = await materializeSnapshotAsync();

  const pricePoints = await insertChunked(priceObservations, (chunk) =>
    db
      .insert(schema.pricePoints)
      .values(
        chunk.map((o) => ({
          id: `${o.productId}:${o.platformId}:${o.date}`,
          productId: o.productId,
          platformId: o.platformId,
          date: o.date,
          lowestAskCents: o.lowestAskCents,
          highestBidCents: o.highestBidCents,
          lastSaleCents: o.lastSaleCents,
        })),
      )
      .onConflictDoNothing(),
  );

  log(`observations: ${pricePoints} price points`);

  const salesPoints = await insertChunked(salesObservations, (chunk) =>
    db
      .insert(schema.salesPoints)
      .values(
        chunk.map((o) => ({
          id: `${o.productId}:${o.platformId}:${o.date}`,
          productId: o.productId,
          platformId: o.platformId,
          date: o.date,
          volume: o.volume,
          avgSaleCents: o.avgSaleCents,
          activeListings: o.activeListings,
        })),
      )
      .onConflictDoNothing(),
  );

  log(`observations: ${salesPoints} sales points`);

  const trends = await insertChunked(attributeTrends.points, (chunk) =>
    db
      .insert(schema.attributeTrends)
      .values(
        chunk.map((point) => ({
          id: `${point.attribute}:${point.value}:${point.month}`,
          attribute: point.attribute,
          value: point.value,
          month: point.month,
          // `numeric` is string-typed in Drizzle on purpose: no float drift.
          share: point.share.toFixed(4),
          avgPriceCents: point.avgPriceCents,
          productCount: point.productCount,
        })),
      )
      .onConflictDoNothing(),
  );

  log(`derived: ${trends} attribute trend points`);

  /* ------------------------------- knowledge ----------------------------- */

  const sources = await insertChunked(editorial.sources, (chunk) =>
    db
      .insert(schema.sources)
      .values(
        chunk.map((s) => ({
          id: s.id,
          name: s.name,
          url: s.url,
          kind: s.kind,
          notes: s.notes,
          retrievedAt: manifest.asOf,
        })),
      )
      .onConflictDoNothing(),
  );

  const insights = await insertChunked(editorial.insights, (chunk) =>
    db
      .insert(schema.insights)
      .values(
        chunk.map((i) => ({
          id: i.id,
          kind: i.kind,
          title: i.title,
          body: i.body,
          authorId: i.authorId,
          sourceId: i.sourceId,
          confidence: i.confidence,
          signal: i.signal,
          status: i.status,
          publishedAt: i.publishedAt,
        })),
      )
      .onConflictDoNothing(),
  );

  const linkRows = editorial.insights.flatMap((insight) =>
    insight.links.map((link, index) => ({
      id: `${insight.id}:${link.entityType}:${link.entityId}:${index}`,
      insightId: insight.id,
      entityType: link.entityType,
      entityId: link.entityId,
    })),
  );

  const insightLinks = await insertChunked(linkRows, (chunk) =>
    db.insert(schema.insightLinks).values(chunk).onConflictDoNothing(),
  );

  log(`knowledge: ${insights} insights, ${insightLinks} links`);

  const articles = await insertChunked(editorial.articles, (chunk) =>
    db
      .insert(schema.articles)
      .values(
        chunk.map((a) => ({
          id: a.id,
          slug: a.slug,
          title: a.title,
          excerpt: a.excerpt,
          body: a.body,
          coverImageUrl: a.coverImageUrl,
          authorId: a.authorId,
          categoryId: a.categoryId,
          tags: a.tags,
          readingMinutes: a.readingMinutes,
          status: a.status,
          publishedAt: a.publishedAt,
        })),
      )
      .onConflictDoNothing(),
  );

  /* ------------------------------ operations ----------------------------- */

  const ingestionRuns = await insertChunked(ops.ingestionRuns, (chunk) =>
    db.insert(schema.ingestionRuns).values(chunk).onConflictDoNothing(),
  );

  const featureFlags = await insertChunked(ops.featureFlags, (chunk) =>
    db.insert(schema.featureFlags).values(chunk).onConflictDoNothing(),
  );

  const subscriptions = await insertChunked(ops.subscriptions, (chunk) =>
    db.insert(schema.subscriptions).values(chunk).onConflictDoNothing(),
  );

  /* ------------------------------- analytics ----------------------------- */

  let trendScores = 0;
  if (!options.skipAnalytics) {
    const report = await refreshTrendScores(db);
    trendScores = report.total;
    log(`analytics: ${trendScores} trend scores (as of ${report.asOf})`);
  }

  return {
    users,
    brands,
    categories,
    platforms,
    products,
    pricePoints,
    salesPoints,
    attributeTrends: trends,
    sources,
    insights,
    insightLinks,
    articles,
    ingestionRuns,
    featureFlags,
    subscriptions,
    trendScores,
    elapsedMs: Date.now() - started,
  };
}

/** `SELECT count(*)` helper used by tests and the admin view. */
export async function countRows(db: Db, table: string): Promise<number> {
  const result = await execute<{ n: number }>(db, 
    sql`select count(*)::int as n from ${sql.identifier(table)}`,
  );
  return result.rows[0]?.n ?? 0;
}
