/**
 * Analytics refresh.
 *
 * The wiring layer between the database and the pure TMI functions. It exists as
 * a separate module for one reason: `tmi.ts` has no I/O, which is what makes the
 * index testable, and this file is the only place that knows how to read
 * observations out of Postgres and write scores back.
 *
 * In production this runs as a scheduled job after ingestion
 * (`pnpm analytics:refresh`); in the demo it runs once at the end of seeding.
 */
import { eq, sql } from 'drizzle-orm';

import type { Db } from '@/db/client';
import {
  insightLinks,
  insights,
  pricePoints,
  products,
  salesPoints,
  trendScores,
} from '@/db/schema';

import {
  computeTmi,
  TMI_DEFAULT_WINDOW_DAYS,
  type TmiObservation,
  type TmiResult,
} from './tmi';

/** The platform whose series drives the index (the deepest one we ingest). */
const PRIMARY_PLATFORM = 'stockx';

export interface EntityScore {
  entityType: 'product' | 'category' | 'color' | 'material';
  entityId: string;
  score: number;
  components: Record<string, number>;
  sampleSize: number;
  confidence: TmiResult['confidence'];
}

export interface RefreshReport {
  asOf: string;
  windowDays: number;
  products: number;
  categories: number;
  colors: number;
  materials: number;
  total: number;
  elapsedMs: number;
}

/* -------------------------------------------------------------------------- */
/* Aggregation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Merge several products' observations into one entity series.
 *
 * Price is volume-weighted and volume/listings are summed. That is the right
 * aggregation for a segment index: it answers "what did this category trade at
 * and how much of it moved", not "what is the average of the averages".
 */
function mergeObservations(seriesList: TmiObservation[][]): TmiObservation[] {
  const byDate = new Map<string, { notional: number; volume: number; listings: number }>();

  for (const series of seriesList) {
    for (const obs of series) {
      const entry = byDate.get(obs.date) ?? { notional: 0, volume: 0, listings: 0 };
      entry.notional += obs.lastSaleCents * obs.volume;
      entry.volume += obs.volume;
      entry.listings += obs.activeListings;
      byDate.set(obs.date, entry);
    }
  }

  return [...byDate.entries()]
    .map(([date, e]) => ({
      date,
      lastSaleCents: e.volume > 0 ? Math.round(e.notional / e.volume) : 0,
      volume: e.volume,
      activeListings: e.listings,
    }))
    .filter((o) => o.lastSaleCents > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Attention signal in 0–1, from the ratio of published analyst notes attached to
 * an entity. Saturates at 5 notes so one heavily annotated product cannot pin
 * the factor to 1 forever.
 */
function attentionFrom(insightCount: number): number {
  return Math.min(1, insightCount / 5);
}

/* -------------------------------------------------------------------------- */
/* Refresh                                                                     */
/* -------------------------------------------------------------------------- */

export async function refreshTrendScores(
  db: Db,
  options: { windowDays?: number; asOf?: string } = {},
): Promise<RefreshReport> {
  const started = Date.now();
  const windowDays = options.windowDays ?? TMI_DEFAULT_WINDOW_DAYS;

  const [productRows, priceRows, salesRows, linkRows] = await Promise.all([
    db
      .select({
        id: products.id,
        categoryId: products.categoryId,
        primaryColor: products.primaryColor,
        materials: products.materials,
      })
      .from(products),
    db
      .select({
        productId: pricePoints.productId,
        date: pricePoints.date,
        lastSaleCents: pricePoints.lastSaleCents,
      })
      .from(pricePoints)
      .where(eq(pricePoints.platformId, PRIMARY_PLATFORM)),
    db
      .select({
        productId: salesPoints.productId,
        date: salesPoints.date,
        volume: salesPoints.volume,
        activeListings: salesPoints.activeListings,
      })
      .from(salesPoints)
      .where(eq(salesPoints.platformId, PRIMARY_PLATFORM)),
    db
      .select({ entityType: insightLinks.entityType, entityId: insightLinks.entityId })
      .from(insightLinks)
      .innerJoin(insights, eq(insights.id, insightLinks.insightId))
      .where(eq(insights.status, 'published')),
  ]);

  /* ------------------------- build per-product series ------------------------ */

  const priceByProduct = new Map<string, Map<string, number>>();
  for (const row of priceRows) {
    const dates = priceByProduct.get(row.productId) ?? new Map<string, number>();
    dates.set(row.date, row.lastSaleCents);
    priceByProduct.set(row.productId, dates);
  }

  const salesByProduct = new Map<string, Map<string, { volume: number; listings: number }>>();
  for (const row of salesRows) {
    const dates =
      salesByProduct.get(row.productId) ?? new Map<string, { volume: number; listings: number }>();
    dates.set(row.date, { volume: row.volume, listings: row.activeListings });
    salesByProduct.set(row.productId, dates);
  }

  const attentionByProduct = new Map<string, number>();
  const attentionByEntity = new Map<string, number>();
  for (const link of linkRows) {
    const key = `${link.entityType}:${link.entityId}`;
    attentionByEntity.set(key, (attentionByEntity.get(key) ?? 0) + 1);
    if (link.entityType === 'product') {
      attentionByProduct.set(link.entityId, (attentionByProduct.get(link.entityId) ?? 0) + 1);
    }
  }

  const seriesByProduct = new Map<string, TmiObservation[]>();
  for (const product of productRows) {
    const prices = priceByProduct.get(product.id);
    if (!prices) continue;
    const sales = salesByProduct.get(product.id);

    const observations: TmiObservation[] = [];
    for (const [date, lastSaleCents] of prices) {
      const s = sales?.get(date);
      observations.push({
        date,
        lastSaleCents,
        volume: s?.volume ?? 0,
        // A missing listing count is reported as 0, which the turnover function
        // treats as unknown rather than as "no supply".
        activeListings: s?.listings ?? 0,
      });
    }
    seriesByProduct.set(product.id, observations);
  }

  const asOf =
    options.asOf ??
    [...seriesByProduct.values()]
      .flat()
      .reduce<string>((max, o) => (o.date > max ? o.date : max), '1970-01-01');

  /* ---------------------------- score products ------------------------------ */

  const scores: EntityScore[] = [];

  for (const product of productRows) {
    const observations = seriesByProduct.get(product.id);
    if (!observations || observations.length === 0) continue;

    const result = computeTmi(observations, {
      windowDays,
      asOf,
      attentionSignal: attentionFrom(attentionByProduct.get(product.id) ?? 0),
    });

    scores.push({
      entityType: 'product',
      entityId: product.id,
      score: result.score,
      components: result.components,
      sampleSize: result.sampleSize,
      confidence: result.confidence,
    });
  }

  /* ------------------------- score segment entities ------------------------- */

  const appendTo = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };

  const categoryMap = new Map<string, string[]>();
  const colorMap = new Map<string, string[]>();
  const materialMap = new Map<string, string[]>();

  for (const product of productRows) {
    appendTo(categoryMap, product.categoryId, product.id);
    appendTo(colorMap, product.primaryColor, product.id);
    for (const material of product.materials ?? []) appendTo(materialMap, material, product.id);
  }

  const groups: { entityType: EntityScore['entityType']; key: string; members: string[] }[] = [];

  for (const [key, members] of categoryMap) groups.push({ entityType: 'category', key, members });
  for (const [key, members] of colorMap) groups.push({ entityType: 'color', key, members });
  for (const [key, members] of materialMap) groups.push({ entityType: 'material', key, members });

  for (const group of groups) {
    const memberSeries = group.members
      .map((id) => seriesByProduct.get(id))
      .filter((s): s is TmiObservation[] => Boolean(s && s.length > 0));
    if (memberSeries.length === 0) continue;

    const merged = mergeObservations(memberSeries);
    const mentions = attentionByEntity.get(`${group.entityType}:${group.key}`) ?? 0;

    const result = computeTmi(merged, {
      windowDays,
      asOf,
      attentionSignal: attentionFrom(mentions),
    });

    scores.push({
      entityType: group.entityType,
      entityId: group.key,
      score: result.score,
      components: result.components,
      sampleSize: result.sampleSize,
      confidence: result.confidence,
    });
  }

  /* ------------------------------- persist --------------------------------- */

  // `numeric` columns round-trip through string in Drizzle, which is deliberate
  // — it avoids float drift in the database.
  const rows = scores.map((s) => ({
    id: `ts:${s.entityType}:${s.entityId}:${windowDays}`,
    entityType: s.entityType,
    entityId: s.entityId,
    windowDays,
    score: s.score.toFixed(2),
    components: s.components as Record<string, number>,
    computedAt: new Date().toISOString(),
  }));

  for (let i = 0; i < rows.length; i += 200) {
    await db
      .insert(trendScores)
      .values(rows.slice(i, i + 200))
      .onConflictDoUpdate({
        target: [trendScores.entityType, trendScores.entityId, trendScores.windowDays],
        set: {
          score: sql`excluded.score`,
          components: sql`excluded.components`,
          computedAt: sql`excluded.computed_at`,
        },
      });
  }

  return {
    asOf,
    windowDays,
    products: scores.filter((s) => s.entityType === 'product').length,
    categories: scores.filter((s) => s.entityType === 'category').length,
    colors: scores.filter((s) => s.entityType === 'color').length,
    materials: scores.filter((s) => s.entityType === 'material').length,
    total: scores.length,
    elapsedMs: Date.now() - started,
  };
}
