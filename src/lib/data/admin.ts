/**
 * Admin and operations read models.
 *
 * Everything here backs the /admin surface: ingestion health, the source
 * registry, feature flags and row counts. Writes for the same tables live in
 * `src/lib/data/actions.ts` as server actions.
 */
import { sql } from 'drizzle-orm';

import { ensureDatabaseReady } from '@/db/bootstrap';
import { getDb } from '@/db/client';
import { execute } from '@/lib/data/query';

export interface IngestionRunRecord {
  id: string;
  provider: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  productsUpserted: number;
  pricePointsUpserted: number;
  durationMs: number | null;
  error: string | null;
  quota: Record<string, number | string> | null;
}

export async function listIngestionRuns(limit = 12): Promise<IngestionRunRecord[]> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<IngestionRunRecord>(db, sql`
    select
      id,
      provider,
      status,
      started_at::text as "startedAt",
      finished_at::text as "finishedAt",
      products_upserted as "productsUpserted",
      price_points_upserted as "pricePointsUpserted",
      duration_ms as "durationMs",
      error,
      quota
    from ingestion_runs
    order by started_at desc
    limit ${limit}
  `);

  return result.rows;
}

export interface FeatureFlagRecord {
  key: string;
  label: string;
  minTier: 'free' | 'pro' | 'enterprise';
  enabled: boolean;
}

export async function listFeatureFlags(): Promise<FeatureFlagRecord[]> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<FeatureFlagRecord>(db, sql`
    select key, label, min_tier as "minTier", enabled
    from feature_flags
    order by
      case min_tier when 'free' then 0 when 'pro' then 1 else 2 end,
      label asc
  `);

  return result.rows;
}

export interface AdminStats {
  products: number;
  pricePoints: number;
  salesPoints: number;
  insights: number;
  draftInsights: number;
  insightLinks: number;
  articles: number;
  draftArticles: number;
  trendScores: number;
  attributeTrends: number;
  sources: number;
  oldestObservation: string | null;
  newestObservation: string | null;
  lastAnalyticsRun: string | null;
}

export async function getAdminStats(): Promise<AdminStats> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<AdminStats>(db, sql`
    select
      (select count(*)::int from products) as "products",
      (select count(*)::int from price_points) as "pricePoints",
      (select count(*)::int from sales_points) as "salesPoints",
      (select count(*)::int from insights) as "insights",
      (select count(*)::int from insights where status = 'draft') as "draftInsights",
      (select count(*)::int from insight_links) as "insightLinks",
      (select count(*)::int from articles) as "articles",
      (select count(*)::int from articles where status = 'draft') as "draftArticles",
      (select count(*)::int from trend_scores) as "trendScores",
      (select count(*)::int from attribute_trends) as "attributeTrends",
      (select count(*)::int from sources) as "sources",
      (select min(date)::text from price_points) as "oldestObservation",
      (select max(date)::text from price_points) as "newestObservation",
      (select max(computed_at)::text from trend_scores) as "lastAnalyticsRun"
  `);

  const row = result.rows[0];
  return {
    products: Number(row?.products ?? 0),
    pricePoints: Number(row?.pricePoints ?? 0),
    salesPoints: Number(row?.salesPoints ?? 0),
    insights: Number(row?.insights ?? 0),
    draftInsights: Number(row?.draftInsights ?? 0),
    insightLinks: Number(row?.insightLinks ?? 0),
    articles: Number(row?.articles ?? 0),
    draftArticles: Number(row?.draftArticles ?? 0),
    trendScores: Number(row?.trendScores ?? 0),
    attributeTrends: Number(row?.attributeTrends ?? 0),
    sources: Number(row?.sources ?? 0),
    oldestObservation: row?.oldestObservation ?? null,
    newestObservation: row?.newestObservation ?? null,
    lastAnalyticsRun: row?.lastAnalyticsRun ?? null,
  };
}

/** Which provider and driver are actually active, for the admin header. */
export function describeRuntime(): {
  provider: string;
  driver: string;
  offline: boolean;
} {
  const provider = (process.env.SOLEINDEX_PROVIDER ?? 'fixture').toLowerCase();
  const driver = (process.env.SOLEINDEX_DB_DRIVER ?? 'pglite').toLowerCase();
  return {
    provider,
    driver,
    offline: provider !== 'kicksdb',
  };
}
