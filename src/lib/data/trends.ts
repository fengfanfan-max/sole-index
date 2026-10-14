/**
 * Trend-intelligence read models.
 *
 * Two different shapes of "trend" live here and they should not be confused:
 *
 *   1. **Cross-sectional share** (`attribute_trends`) — what proportion of
 *      transaction value sits behind each colour / material / category, over
 *      time. This is a *composition* measure.
 *   2. **Momentum** (`trend_scores`, from the TMI) — whether demand for one
 *      entity is currently accelerating. This is a *level* measure.
 *
 * A colourway can hold a large share and still be losing momentum. The UI keeps
 * them visually distinct for that reason, and the copy never equates them.
 */
import { sql } from 'drizzle-orm';

import { ensureDatabaseReady } from '@/db/bootstrap';
import { getDb } from '@/db/client';
import { TMI_WEIGHTS, type TmiFactor } from '@/lib/analytics/tmi';
import { execute } from '@/lib/data/query';

export type TrendAttribute = 'color' | 'material' | 'category';

export interface AttributeSeries {
  value: string;
  points: { month: string; share: number; avgPriceCents: number; productCount: number }[];
}

export interface AttributeSummary {
  value: string;
  firstShare: number;
  lastShare: number;
  /** Share delta across the window, in share units (not percentage points). */
  delta: number;
  lastAvgPriceCents: number;
  productCount: number;
}

export interface AttributeTrendResult {
  months: string[];
  series: AttributeSeries[];
  summaries: AttributeSummary[];
}

/**
 * Monthly share series for one attribute, plus first-vs-last deltas.
 *
 * The delta is computed from the *ends* of the window rather than a regression:
 * for a share series with a visible rotation, endpoint comparison is what a
 * reader would do by eye, so matching it keeps the number and the chart
 * consistent.
 */
export async function getAttributeTrend(
  attribute: TrendAttribute,
): Promise<AttributeTrendResult> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<{
    value: string;
    month: string;
    share: string;
    avgPriceCents: number;
    productCount: number;
  }>(db, sql`
    select value, month::text as month, share::text as share,
           avg_price_cents as "avgPriceCents", product_count as "productCount"
    from attribute_trends
    where attribute = ${attribute}
    order by value asc, month asc
  `);

  const months = [...new Set(result.rows.map((r) => r.month))].sort();
  const byValue = new Map<string, AttributeSeries['points']>();

  for (const row of result.rows) {
    const points = byValue.get(row.value) ?? [];
    points.push({
      month: row.month,
      share: Number(row.share),
      avgPriceCents: Number(row.avgPriceCents),
      productCount: Number(row.productCount),
    });
    byValue.set(row.value, points);
  }

  const series: AttributeSeries[] = [...byValue.entries()].map(([value, points]) => ({
    value,
    points,
  }));

  const summaries: AttributeSummary[] = series.map((s) => {
    const first = s.points[0];
    const last = s.points[s.points.length - 1];
    return {
      value: s.value,
      firstShare: first?.share ?? 0,
      lastShare: last?.share ?? 0,
      delta: (last?.share ?? 0) - (first?.share ?? 0),
      lastAvgPriceCents: last?.avgPriceCents ?? 0,
      productCount: last?.productCount ?? 0,
    };
  });

  summaries.sort((a, b) => b.delta - a.delta);

  return { months, series, summaries };
}

/* -------------------------------------------------------------------------- */
/* Momentum                                                                    */
/* -------------------------------------------------------------------------- */

export type ScoredEntityType = 'product' | 'category' | 'color' | 'material';

export interface ScoredEntity {
  entityId: string;
  label: string;
  sublabel: string | null;
  score: number;
  components: Record<TmiFactor, number>;
  colorHex: string | null;
}

/**
 * Entity TMI rows joined to a human label.
 *
 * The join target differs per entity type, which is exactly the awkwardness a
 * polymorphic relation creates. It is resolved with a `CASE` in one statement
 * rather than N queries, and the alternative (separate tables per type) is
 * discussed in docs/architecture.md.
 */
export async function getScoredEntities(
  entityType: ScoredEntityType,
  options: { limit?: number; order?: 'asc' | 'desc' } = {},
): Promise<ScoredEntity[]> {
  await ensureDatabaseReady();
  const db = await getDb();
  const { limit = 60, order = 'desc' } = options;

  const result = await execute<{
    entityId: string;
    label: string;
    sublabel: string | null;
    score: string;
    components: Record<string, number>;
  }>(db, sql`
    select
      ts.entity_id as "entityId",
      case
        when ${entityType} = 'product' then (select p.name from products p where p.id = ts.entity_id)
        when ${entityType} = 'category' then (select c.name from categories c where c.id = ts.entity_id)
        else ts.entity_id
      end as "label",
      case
        when ${entityType} = 'product' then (select p.colorway from products p where p.id = ts.entity_id)
        when ${entityType} = 'category' then (select count(*)::text || ' products' from products p where p.category_id = ts.entity_id)
        else null
      end as "sublabel",
      ts.score::text as "score",
      ts.components as "components"
    from trend_scores ts
    where ts.entity_type = ${entityType}
    order by ts.score ${order === 'asc' ? sql`asc` : sql`desc`}
    limit ${limit}
  `);

  return result.rows.map((row) => ({
    entityId: row.entityId,
    label: row.label ?? row.entityId,
    sublabel: row.sublabel,
    score: Number(row.score),
    components: normalizeComponents(row.components),
    colorHex: null,
  }));
}

function normalizeComponents(raw: Record<string, number> | null): Record<TmiFactor, number> {
  const out = {} as Record<TmiFactor, number>;
  for (const factor of Object.keys(TMI_WEIGHTS) as TmiFactor[]) {
    out[factor] = Number(raw?.[factor] ?? 0.5);
  }
  return out;
}

export interface TmiBreakdown {
  entityType: ScoredEntityType;
  entityId: string;
  label: string;
  score: number;
  components: Record<TmiFactor, number>;
  windowDays: number;
  computedAt: string;
}

export async function getTmiBreakdown(
  entityType: ScoredEntityType,
  entityId: string,
): Promise<TmiBreakdown | null> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<{
    score: string;
    components: Record<string, number>;
    windowDays: number;
    computedAt: string;
    label: string | null;
  }>(db, sql`
    select
      ts.score::text as "score",
      ts.components as "components",
      ts.window_days as "windowDays",
      ts.computed_at::text as "computedAt",
      (select p.name from products p where p.id = ts.entity_id) as "label"
    from trend_scores ts
    where ts.entity_type = ${entityType} and ts.entity_id = ${entityId}
    limit 1
  `);

  const row = result.rows[0];
  if (!row) return null;

  return {
    entityType,
    entityId,
    label: row.label ?? entityId,
    score: Number(row.score),
    components: normalizeComponents(row.components),
    windowDays: Number(row.windowDays),
    computedAt: row.computedAt,
  };
}

export interface AttributeRotation {
  value: string;
  delta: number;
  lastShare: number;
}

/**
 * The headline rotation numbers for both attribute dimensions at once — what the
 * overview page and the methodology page both need.
 */
export async function getRotationSummary(): Promise<{
  colors: AttributeRotation[];
  materials: AttributeRotation[];
  months: string[];
}> {
  const [colors, materials] = await Promise.all([
    getAttributeTrend('color'),
    getAttributeTrend('material'),
  ]);

  const toRotation = (r: AttributeTrendResult): AttributeRotation[] =>
    r.summaries
      .map((s) => ({ value: s.value, delta: s.delta, lastShare: s.lastShare }))
      .sort((a, b) => b.delta - a.delta);

  return {
    colors: toRotation(colors),
    materials: toRotation(materials),
    months: colors.months,
  };
}

export interface MarketMomentum {
  heating: number;
  cooling: number;
  stable: number;
  median: number;
  total: number;
}

/** Distribution of product momentum, for the overview strip. */
export async function getMarketMomentum(): Promise<MarketMomentum> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<{
    heating: number;
    cooling: number;
    stable: number;
    median: number;
    total: number;
  }>(db, sql`
    select
      count(*) filter (where score >= 60)::int as "heating",
      count(*) filter (where score < 40)::int as "cooling",
      count(*) filter (where score >= 40 and score < 60)::int as "stable",
      coalesce(percentile_cont(0.5) within group (order by score), 50)::float8 as "median",
      count(*)::int as "total"
    from trend_scores
    where entity_type = 'product'
  `);

  const row = result.rows[0];
  return {
    heating: Number(row?.heating ?? 0),
    cooling: Number(row?.cooling ?? 0),
    stable: Number(row?.stable ?? 0),
    median: Number(row?.median ?? 50),
    total: Number(row?.total ?? 0),
  };
}
