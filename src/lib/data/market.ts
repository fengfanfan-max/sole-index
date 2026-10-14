/**
 * Market-level read models.
 *
 * Query strategy across `src/lib/data/*`: **analytic aggregates are written as
 * SQL, entity CRUD goes through Drizzle's query builder.** The builder's strength
 * is type-safe structured queries; its weakness is expressing window functions
 * and lateral joins, where generated nesting hurts readability more than it
 * helps safety. The trade-off is documented in docs/architecture.md.
 *
 * Every function calls `ensureDatabaseReady()` first, so a cold process (a fresh
 * clone, or a serverless instance after a deploy) migrates and seeds itself on
 * the first request rather than erroring.
 */
import { sql } from 'drizzle-orm';

import { ensureDatabaseReady } from '@/db/bootstrap';
import { getDb } from '@/db/client';
import { execute } from '@/lib/data/query';

const PRIMARY_PLATFORM = 'stockx';

export interface MarketIndexPoint {
  date: string;
  /** Volume-weighted resale multiple across the catalogue. 1.0 = retail. */
  index: number;
  volume: number;
}

export interface MarketOverview {
  asOf: string;
  firstWeek: string;
  indexNow: number;
  index4wAgo: number;
  index52wAgo: number;
  change4w: number;
  change52w: number;
  volume4w: number;
  volumePrior4w: number;
  volumeChange: number;
  activeListings: number;
  trackedProducts: number;
  trackedBrands: number;
  trackedCategories: number;
  publishedInsights: number;
  publishedArticles: number;
  observations: number;
}

/**
 * The market index: volume-weighted resale multiple over retail.
 *
 * Weighting by volume is the important choice — a simple mean would let a single
 * illiquid grail move the whole market. Expressing it as a *multiple of retail*
 * rather than an absolute price makes it comparable across a catalogue whose
 * retail prices range from $60 to $235.
 */
export async function getMarketIndexSeries(): Promise<MarketIndexPoint[]> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<{ date: string; index: number; volume: number }>(db, sql`
    select
      pp.date::text as "date",
      (sum(pp.last_sale_cents::float8 * sp.volume)
        / nullif(sum(p.retail_price_cents::float8 * sp.volume), 0)) as "index",
      sum(sp.volume)::int as "volume"
    from price_points pp
    join sales_points sp
      on sp.product_id = pp.product_id
     and sp.date = pp.date
     and sp.platform_id = pp.platform_id
    join products p on p.id = pp.product_id
    where pp.platform_id = ${PRIMARY_PLATFORM}
    group by pp.date
    having sum(sp.volume) > 0
    order by pp.date asc
  `);

  return result.rows.map((row) => ({
    date: row.date,
    index: Number(row.index ?? 0),
    volume: Number(row.volume ?? 0),
  }));
}

export async function getMarketOverview(): Promise<MarketOverview> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<{
    asOf: string | null;
    firstWeek: string | null;
    indexNow: number | null;
    index4w: number | null;
    index52w: number | null;
    volume4w: number | null;
    volumePrior4w: number | null;
    listings: number | null;
  }>(db, sql`
    with bounds as (
      select max(pp.date) as as_of, min(pp.date) as first_week
      from price_points pp where pp.platform_id = ${PRIMARY_PLATFORM}
    ),
    weekly as (
      select
        pp.date,
        sum(pp.last_sale_cents::float8 * sp.volume)
          / nullif(sum(p.retail_price_cents::float8 * sp.volume), 0) as idx,
        sum(sp.volume)::int as vol
      from price_points pp
      join sales_points sp
        on sp.product_id = pp.product_id
       and sp.date = pp.date
       and sp.platform_id = pp.platform_id
      join products p on p.id = pp.product_id
      where pp.platform_id = ${PRIMARY_PLATFORM}
      group by pp.date
    ),
    latest AS (select * from weekly order by date desc limit 1)
    select
      (select as_of::text from bounds) as "asOf",
      (select first_week::text from bounds) as "firstWeek",
      (select idx from latest) as "indexNow",
      (select idx from weekly where date <= (select as_of from bounds) - 28 order by date desc limit 1) as "index4w",
      (select idx from weekly where date <= (select as_of from bounds) - 364 order by date desc limit 1) as "index52w",
      (select sum(vol)::int from weekly where date > (select as_of from bounds) - 28) as "volume4w",
      (select sum(vol)::int from weekly
        where date > (select as_of from bounds) - 56
          and date <= (select as_of from bounds) - 28) as "volumePrior4w",
      (select sum(sp.active_listings)::int from sales_points sp
        where sp.platform_id = ${PRIMARY_PLATFORM}
          and sp.date = (select as_of from bounds)) as "listings"
  `);

  const row = result.rows[0] ?? {};
  const indexNow = Number(row.indexNow ?? 1);
  const index4wAgo = Number(row.index4w ?? indexNow);
  const index52wAgo = Number(row.index52w ?? indexNow);
  const volume4w = Number(row.volume4w ?? 0);
  const volumePrior4w = Number(row.volumePrior4w ?? 0);
  const asOf = row.asOf ?? new Date().toISOString().slice(0, 10);

  const counts = await execute<{
    products: number;
    brands: number;
    categories: number;
    insights: number;
    articles: number;
    observations: number;
  }>(db, sql`
    select
      (select count(*)::int from products) as "products",
      (select count(*)::int from brands) as "brands",
      (select count(*)::int from categories) as "categories",
      (select count(*)::int from insights where status = 'published') as "insights",
      (select count(*)::int from articles where status = 'published') as "articles",
      (select count(*)::int from price_points) as "observations"
  `);
  const c = counts.rows[0];

  return {
    asOf,
    firstWeek: row.firstWeek ?? asOf,
    indexNow,
    index4wAgo,
    index52wAgo,
    change4w: index4wAgo === 0 ? 0 : indexNow / index4wAgo - 1,
    change52w: index52wAgo === 0 ? 0 : indexNow / index52wAgo - 1,
    volume4w,
    volumePrior4w,
    volumeChange: volumePrior4w === 0 ? 0 : volume4w / volumePrior4w - 1,
    activeListings: Number(row.listings ?? 0),
    trackedProducts: c?.products ?? 0,
    trackedBrands: c?.brands ?? 0,
    trackedCategories: c?.categories ?? 0,
    publishedInsights: c?.insights ?? 0,
    publishedArticles: c?.articles ?? 0,
    observations: c?.observations ?? 0,
  };
}

export interface CategorySummary {
  categoryId: string;
  name: string;
  productCount: number;
  index: number;
  change4w: number;
  volume4w: number;
  tmiScore: number | null;
}

/** Per-category market state, including the stored segment TMI. */
export async function getCategorySummaries(): Promise<CategorySummary[]> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<{
    categoryId: string;
    name: string;
    productCount: number;
    index: number | null;
    priorIndex: number | null;
    volume4w: number;
    tmiScore: string | null;
  }>(db, sql`
    with bounds as (
      select max(date) as as_of from price_points where platform_id = ${PRIMARY_PLATFORM}
    ),
    latest_per_product as (
      select distinct on (pp.product_id) pp.product_id, pp.last_sale_cents
      from price_points pp
      where pp.platform_id = ${PRIMARY_PLATFORM}
      order by pp.product_id, pp.date desc
    ),
    prior_per_product as (
      select distinct on (pp.product_id) pp.product_id, pp.last_sale_cents
      from price_points pp
      where pp.platform_id = ${PRIMARY_PLATFORM}
        and pp.date <= (select as_of from bounds) - 28
      order by pp.product_id, pp.date desc
    ),
    volume_recent as (
      select sp.product_id, sum(sp.volume)::int as vol
      from sales_points sp, bounds b
      where sp.platform_id = ${PRIMARY_PLATFORM} and sp.date > b.as_of - 28
      group by sp.product_id
    )
    select
      c.id as "categoryId",
      c.name as "name",
      count(distinct p.id)::int as "productCount",
      avg(l.last_sale_cents::float8 / nullif(p.retail_price_cents, 0)) as "index",
      avg(f.last_sale_cents::float8 / nullif(p.retail_price_cents, 0)) as "priorIndex",
      coalesce(sum(v.vol), 0)::int as "volume4w",
      max(ts.score)::text as "tmiScore"
    from categories c
    join products p on p.category_id = c.id
    left join latest_per_product l on l.product_id = p.id
    left join prior_per_product f on f.product_id = p.id
    left join volume_recent v on v.product_id = p.id
    left join trend_scores ts
      on ts.entity_type = 'category' and ts.entity_id = c.id
    group by c.id, c.name
    order by c.name
  `);

  return result.rows.map((row) => {
    const index = Number(row.index ?? 0);
    const priorIndex = Number(row.priorIndex ?? index);
    return {
      categoryId: row.categoryId,
      name: row.name,
      productCount: Number(row.productCount ?? 0),
      index,
      change4w: priorIndex === 0 ? 0 : index / priorIndex - 1,
      volume4w: Number(row.volume4w ?? 0),
      tmiScore: row.tmiScore === null ? null : Number(row.tmiScore),
    };
  });
}

export interface Mover {
  productId: string;
  slug: string;
  name: string;
  brandName: string;
  colorway: string;
  primaryColor: string;
  retailPriceCents: number;
  latestCents: number;
  priorCents: number;
  change: number;
  multiple: number;
  volume4w: number;
  tmiScore: number | null;
}

/**
 * Largest 30-day price moves.
 *
 * `minVolume` exists because without it the list is dominated by products that
 * traded twice, where a single print is the entire signal. Surfacing that
 * threshold in the UI matters: a "top mover" list you cannot interrogate is a
 * list you should not trust.
 */
export async function getMovers(options: {
  limit?: number;
  direction?: 'up' | 'down';
  minVolume?: number;
} = {}): Promise<Mover[]> {
  const { limit = 8, direction, minVolume = 12 } = options;
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<{
    productId: string;
    slug: string;
    name: string;
    brandName: string;
    colorway: string;
    primaryColor: string;
    retailPriceCents: number;
    latestCents: number;
    priorCents: number;
    volume4w: number;
    tmiScore: string | null;
  }>(db, sql`
    with bounds as (
      select max(date) as as_of from price_points where platform_id = ${PRIMARY_PLATFORM}
    ),
    latest_per_product as (
      select distinct on (pp.product_id) pp.product_id, pp.last_sale_cents
      from price_points pp where pp.platform_id = ${PRIMARY_PLATFORM}
      order by pp.product_id, pp.date desc
    ),
    prior_per_product as (
      select distinct on (pp.product_id) pp.product_id, pp.last_sale_cents
      from price_points pp, bounds b
      where pp.platform_id = ${PRIMARY_PLATFORM} and pp.date <= b.as_of - 28
      order by pp.product_id, pp.date desc
    ),
    volume_recent as (
      select sp.product_id, sum(sp.volume)::int as vol
      from sales_points sp, bounds b
      where sp.platform_id = ${PRIMARY_PLATFORM} and sp.date > b.as_of - 28
      group by sp.product_id
    )
    select
      p.id as "productId",
      p.slug as "slug",
      p.name as "name",
      b.name as "brandName",
      p.colorway as "colorway",
      p.primary_color as "primaryColor",
      p.retail_price_cents as "retailPriceCents",
      l.last_sale_cents as "latestCents",
      f.last_sale_cents as "priorCents",
      coalesce(v.vol, 0)::int as "volume4w",
      ts.score::text as "tmiScore"
    from products p
    join brands b on b.id = p.brand_id
    join latest_per_product l on l.product_id = p.id
    join prior_per_product f on f.product_id = p.id
    left join volume_recent v on v.product_id = p.id
    left join trend_scores ts on ts.entity_type = 'product' and ts.entity_id = p.id
    where f.last_sale_cents > 0
      and coalesce(v.vol, 0) >= ${minVolume}
    order by
      ${direction === 'down' ? sql`(l.last_sale_cents::float8 / f.last_sale_cents) asc` : sql`(l.last_sale_cents::float8 / f.last_sale_cents) desc`}
    limit ${limit}
  `);

  return result.rows.map((row) => {
    const latestCents = Number(row.latestCents);
    const priorCents = Number(row.priorCents);
    const retailPriceCents = Number(row.retailPriceCents);
    return {
      productId: row.productId,
      slug: row.slug,
      name: row.name,
      brandName: row.brandName,
      colorway: row.colorway,
      primaryColor: row.primaryColor,
      retailPriceCents,
      latestCents,
      priorCents,
      change: priorCents === 0 ? 0 : latestCents / priorCents - 1,
      multiple: retailPriceCents === 0 ? 0 : latestCents / retailPriceCents,
      volume4w: Number(row.volume4w ?? 0),
      tmiScore: row.tmiScore === null ? null : Number(row.tmiScore),
    };
  });
}
