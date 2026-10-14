/**
 * Catalogue read models: search, filtering, product detail and comparison.
 *
 * The product list is the single most demanding query in the app — it joins the
 * catalogue to the latest price, a 30-day-ago price, recent volume and the
 * stored TMI score, then filters and sorts across all of them. It is expressed
 * as one parameterised statement with lateral joins rather than a query per
 * product.
 */
import { sql, type SQL } from 'drizzle-orm';

import { ensureDatabaseReady } from '@/db/bootstrap';
import { getDb } from '@/db/client';
import { execute } from '@/lib/data/query';

const PRIMARY_PLATFORM = 'stockx';

export type SortKey =
  | 'tmi'
  | 'price-desc'
  | 'price-asc'
  | 'change-desc'
  | 'change-asc'
  | 'volume-desc'
  | 'release-desc'
  | 'name-asc';

export interface ProductFilters {
  q?: string;
  brand?: string;
  category?: string;
  color?: string;
  material?: string;
  /** Resale multiple band, e.g. 'below-retail' | 'at-retail' | 'premium' | 'grail'. */
  band?: string;
  sort?: SortKey;
  page?: number;
  perPage?: number;
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  silhouette: string;
  colorway: string;
  primaryColor: string;
  secondaryColor: string | null;
  materials: string[];
  releaseDate: string;
  retailPriceCents: number;
  latestCents: number | null;
  priorCents: number | null;
  change: number | null;
  multiple: number | null;
  volume4w: number;
  tmiScore: number | null;
}

export interface ProductListResult {
  rows: ProductRow[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

/**
 * Resale-multiple bands. Named bands rather than a raw min/max slider because in
 * this market the meaningful question is "is it trading above or below retail",
 * not "is it between $180 and $240".
 */
export const PRICE_BANDS = [
  { key: 'all', label: 'Any multiple' },
  { key: 'below-retail', label: 'Below retail', min: 0, max: 1.0 },
  { key: 'at-retail', label: 'At retail', min: 1.0, max: 1.25 },
  { key: 'premium', label: 'Premium', min: 1.25, max: 2.0 },
  { key: 'grail', label: 'Grail', min: 2.0, max: 99 },
] as const;

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'tmi', label: 'Trend momentum' },
  { key: 'change-desc', label: 'Biggest gainers' },
  { key: 'change-asc', label: 'Biggest fallers' },
  { key: 'price-desc', label: 'Highest price' },
  { key: 'price-asc', label: 'Lowest price' },
  { key: 'volume-desc', label: 'Most traded' },
  { key: 'release-desc', label: 'Newest release' },
  { key: 'name-asc', label: 'Name (A–Z)' },
];

const ORDER_BY: Record<SortKey, SQL> = {
  tmi: sql`ts.score desc nulls last, p.name asc`,
  'price-desc': sql`l.last_sale_cents desc nulls last`,
  'price-asc': sql`l.last_sale_cents asc nulls last`,
  'change-desc': sql`(l.last_sale_cents::float8 / nullif(f.last_sale_cents, 0)) desc nulls last`,
  'change-asc': sql`(l.last_sale_cents::float8 / nullif(f.last_sale_cents, 0)) asc nulls last`,
  'volume-desc': sql`coalesce(v.vol, 0) desc`,
  'release-desc': sql`p.release_date desc`,
  'name-asc': sql`p.name asc`,
};

/**
 * Shared CTE preamble for every catalogue query that needs price context.
 *
 * `latest` / `prior` use `distinct on` rather than a correlated subquery because
 * Postgres can satisfy `distinct on (product_id)` directly from the
 * `(product_id, platform_id, date)` index — one ordered scan instead of N.
 */
function priceContext(): SQL {
  return sql`
    bounds as (
      select max(date) as as_of from price_points where platform_id = ${PRIMARY_PLATFORM}
    ),
    latest as (
      select distinct on (pp.product_id) pp.product_id, pp.last_sale_cents
      from price_points pp
      where pp.platform_id = ${PRIMARY_PLATFORM}
      order by pp.product_id, pp.date desc
    ),
    prior as (
      select distinct on (pp.product_id) pp.product_id, pp.last_sale_cents
      from price_points pp, bounds b
      where pp.platform_id = ${PRIMARY_PLATFORM} and pp.date <= b.as_of - 28
      order by pp.product_id, pp.date desc
    ),
    recent_volume as (
      select sp.product_id, sum(sp.volume)::int as vol
      from sales_points sp, bounds b
      where sp.platform_id = ${PRIMARY_PLATFORM} and sp.date > b.as_of - 28
      group by sp.product_id
    )
  `;
}

/**
 * Full-text search with a substring fallback.
 *
 * `websearch_to_tsquery` gives phrase quoting, OR and `-exclusion` for free, but
 * it tokenises — so "samb" would not match "Samba". The `ILIKE` disjunction
 * covers as-you-type prefixes. At larger scale the fix is a generated tsvector
 * column plus a GIN index; at 240 products a sequential scan is free and the
 * extra machinery would be cargo cult.
 */
function searchCondition(query: string): SQL {
  const like = `%${query}%`;
  return sql`(
    to_tsvector('english',
      coalesce(p.name, '') || ' ' || coalesce(p.colorway, '') || ' ' ||
      coalesce(p.silhouette, '') || ' ' || coalesce(b.name, '')
    ) @@ websearch_to_tsquery('english', ${query})
    or p.name ilike ${like}
    or p.colorway ilike ${like}
    or p.silhouette ilike ${like}
    or p.id ilike ${like}
    or b.name ilike ${like}
  )`;
}

function bandCondition(band: string | undefined): SQL | null {
  const spec = PRICE_BANDS.find((b) => b.key === band);
  if (!spec || spec.key === 'all') return null;
  return sql`(l.last_sale_cents::float8 / nullif(p.retail_price_cents, 0)) between ${spec.min} and ${spec.max}`;
}

function buildFilters(filters: ProductFilters): SQL {
  const conditions: SQL[] = [];

  if (filters.q?.trim()) conditions.push(searchCondition(filters.q.trim()));
  if (filters.brand) conditions.push(sql`p.brand_id = ${filters.brand}`);
  if (filters.category) conditions.push(sql`p.category_id = ${filters.category}`);
  if (filters.color) conditions.push(sql`p.primary_color = ${filters.color}`);
  // Array overlap: a product matches if it contains *any* of the requested
  // materials. `&&` uses the GIN index on the array column.
  if (filters.material) conditions.push(sql`p.materials && array[${filters.material}]::text[]`);

  const band = bandCondition(filters.band);
  if (band) conditions.push(band);

  return conditions.length > 0
    ? sql`where ${sql.join(conditions, sql` and `)}`
    : sql``;
}

export async function listProducts(filters: ProductFilters = {}): Promise<ProductListResult> {
  await ensureDatabaseReady();
  const db = await getDb();

  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(100, Math.max(6, filters.perPage ?? 24));
  const offset = (page - 1) * perPage;
  const where = buildFilters(filters);
  const orderBy = ORDER_BY[filters.sort ?? 'tmi'];

  const result = await execute<ProductRow & { total: number }>(db, sql`
    with ${priceContext()}
    select
      p.id as "id",
      p.slug as "slug",
      p.name as "name",
      p.brand_id as "brandId",
      b.name as "brandName",
      p.category_id as "categoryId",
      c.name as "categoryName",
      p.silhouette as "silhouette",
      p.colorway as "colorway",
      p.primary_color as "primaryColor",
      p.secondary_color as "secondaryColor",
      p.materials as "materials",
      p.release_date::text as "releaseDate",
      p.retail_price_cents as "retailPriceCents",
      l.last_sale_cents as "latestCents",
      f.last_sale_cents as "priorCents",
      coalesce(v.vol, 0) as "volume4w",
      ts.score::text as "tmiScore",
      count(*) over ()::int as "total"
    from products p
    join brands b on b.id = p.brand_id
    join categories c on c.id = p.category_id
    left join latest l on l.product_id = p.id
    left join prior f on f.product_id = p.id
    left join recent_volume v on v.product_id = p.id
    left join trend_scores ts on ts.entity_type = 'product' and ts.entity_id = p.id
    ${where}
    order by ${orderBy}
    limit ${perPage} offset ${offset}
  `);

  const total = result.rows[0]?.total ?? 0;

  return {
    rows: result.rows.map((row) => {
      const latestCents = row.latestCents === null ? null : Number(row.latestCents);
      const priorCents = row.priorCents === null ? null : Number(row.priorCents);
      const retailPriceCents = Number(row.retailPriceCents);
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        brandId: row.brandId,
        brandName: row.brandName,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        silhouette: row.silhouette,
        colorway: row.colorway,
        primaryColor: row.primaryColor,
        secondaryColor: row.secondaryColor,
        materials: row.materials ?? [],
        releaseDate: row.releaseDate,
        retailPriceCents,
        latestCents,
        priorCents,
        change:
          latestCents !== null && priorCents !== null && priorCents > 0
            ? latestCents / priorCents - 1
            : null,
        multiple:
          latestCents !== null && retailPriceCents > 0 ? latestCents / retailPriceCents : null,
        volume4w: Number(row.volume4w ?? 0),
        tmiScore: row.tmiScore === null ? null : Number(row.tmiScore),
      };
    }),
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

export interface FilterOptions {
  brands: { id: string; name: string; count: number }[];
  categories: { id: string; name: string; count: number }[];
  colors: { key: string; count: number }[];
  materials: { key: string; count: number }[];
}

/** Facet counts, so the filter UI can show how much is behind each option. */
export async function getFilterOptions(): Promise<FilterOptions> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<{
    brands: FilterOptions['brands'];
    categories: FilterOptions['categories'];
    colors: FilterOptions['colors'];
    materials: FilterOptions['materials'];
  }>(db, sql`
    select
      (select json_agg(x) from (
        select b.id, b.name, count(p.id)::int as count
        from brands b left join products p on p.brand_id = b.id
        group by b.id, b.name order by b.name
      ) x) as "brands",
      (select json_agg(x) from (
        select c.id, c.name, count(p.id)::int as count
        from categories c left join products p on p.category_id = c.id
        group by c.id, c.name order by c.name
      ) x) as "categories",
      (select json_agg(x) from (
        select p.primary_color as key, count(*)::int as count
        from products p group by p.primary_color order by count(*) desc
      ) x) as "colors",
      (select json_agg(x) from (
        select m as key, count(*)::int as count
        from products p, unnest(p.materials) as m
        group by m order by count(*) desc
      ) x) as "materials"
  `);

  const row = result.rows[0];
  return {
    brands: row?.brands ?? [],
    categories: row?.categories ?? [],
    colors: row?.colors ?? [],
    materials: row?.materials ?? [],
  };
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                      */
/* -------------------------------------------------------------------------- */

export interface ProductDetail extends ProductRow {
  description: string | null;
  imageUrl: string | null;
  currency: string;
}

export interface PriceSeriesPoint {
  date: string;
  lowestAskCents: number | null;
  highestBidCents: number | null;
  lastSaleCents: number | null;
}

export interface SalesSeriesPoint {
  date: string;
  volume: number;
  avgSaleCents: number;
  activeListings: number;
}

export async function getProductByIdOrSlug(idOrSlug: string): Promise<ProductDetail | null> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<ProductDetail & { tmiScore: string | null }>(db, sql`
    with ${priceContext()}
    select
      p.id as "id",
      p.slug as "slug",
      p.name as "name",
      p.brand_id as "brandId",
      b.name as "brandName",
      p.category_id as "categoryId",
      c.name as "categoryName",
      p.silhouette as "silhouette",
      p.colorway as "colorway",
      p.primary_color as "primaryColor",
      p.secondary_color as "secondaryColor",
      p.materials as "materials",
      p.release_date::text as "releaseDate",
      p.retail_price_cents as "retailPriceCents",
      p.description as "description",
      p.image_url as "imageUrl",
      p.currency as "currency",
      l.last_sale_cents as "latestCents",
      f.last_sale_cents as "priorCents",
      coalesce(v.vol, 0) as "volume4w",
      ts.score::text as "tmiScore"
    from products p
    join brands b on b.id = p.brand_id
    join categories c on c.id = p.category_id
    left join latest l on l.product_id = p.id
    left join prior f on f.product_id = p.id
    left join recent_volume v on v.product_id = p.id
    left join trend_scores ts on ts.entity_type = 'product' and ts.entity_id = p.id
    where p.id = ${idOrSlug} or p.slug = ${idOrSlug}
    limit 1
  `);

  const row = result.rows[0];
  if (!row) return null;

  const latestCents = row.latestCents === null ? null : Number(row.latestCents);
  const priorCents = row.priorCents === null ? null : Number(row.priorCents);
  const retailPriceCents = Number(row.retailPriceCents);

  return {
    ...row,
    retailPriceCents,
    latestCents,
    priorCents,
    change:
      latestCents !== null && priorCents !== null && priorCents > 0
        ? latestCents / priorCents - 1
        : null,
    multiple: latestCents !== null && retailPriceCents > 0 ? latestCents / retailPriceCents : null,
    volume4w: Number(row.volume4w ?? 0),
    tmiScore: row.tmiScore === null ? null : Number(row.tmiScore),
  };
}

export async function getPriceSeries(productId: string): Promise<PriceSeriesPoint[]> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<PriceSeriesPoint>(db, sql`
    select
      date::text as "date",
      max(lowest_ask_cents) filter (where platform_id = ${PRIMARY_PLATFORM}) as "lowestAskCents",
      max(highest_bid_cents) filter (where platform_id = ${PRIMARY_PLATFORM}) as "highestBidCents",
      max(last_sale_cents) filter (where platform_id = ${PRIMARY_PLATFORM}) as "lastSaleCents"
    from price_points
    where product_id = ${productId}
    group by date
    order by date asc
  `);

  return result.rows.map((row) => ({
    date: row.date,
    lowestAskCents: row.lowestAskCents === null ? null : Number(row.lowestAskCents),
    highestBidCents: row.highestBidCents === null ? null : Number(row.highestBidCents),
    lastSaleCents: row.lastSaleCents === null ? null : Number(row.lastSaleCents),
  }));
}

export async function getSalesSeries(productId: string): Promise<SalesSeriesPoint[]> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<SalesSeriesPoint>(db, sql`
    select
      date::text as "date",
      volume,
      avg_sale_cents as "avgSaleCents",
      active_listings as "activeListings"
    from sales_points
    where product_id = ${productId} and platform_id = ${PRIMARY_PLATFORM}
    order by date asc
  `);

  return result.rows.map((row) => ({
    date: row.date,
    volume: Number(row.volume),
    avgSaleCents: Number(row.avgSaleCents),
    activeListings: Number(row.activeListings),
  }));
}

/** Cross-platform snapshot for the comparison spread chart. */
export async function getPlatformComparison(productId: string): Promise<
  { platformId: string; platformName: string; date: string; lastSaleCents: number }[]
> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<{
    platformId: string;
    platformName: string;
    date: string;
    lastSaleCents: number;
  }>(db, sql`
    select
      pp.platform_id as "platformId",
      pl.name as "platformName",
      pp.date::text as "date",
      pp.last_sale_cents as "lastSaleCents"
    from price_points pp
    join platforms pl on pl.id = pp.platform_id
    where pp.product_id = ${productId}
    order by pp.date asc
  `);

  return result.rows.map((row) => ({ ...row, lastSaleCents: Number(row.lastSaleCents) }));
}

export interface HourlyAlternative {
  id: string;
  slug: string;
  name: string;
  colorway: string;
  latestCents: number | null;
  multiple: number | null;
}

/**
 * "Similar" products: same silhouette, different colourway.
 *
 * Deliberately narrow rather than embedding-similarity. For this catalogue the
 * useful comparison is the same shoe in another colour, and a defensible simple
 * rule beats an unexplainable one.
 */
export async function getSimilarProducts(
  productId: string,
  silhouette: string,
  limit = 4,
): Promise<HourlyAlternative[]> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<{
    id: string;
    slug: string;
    name: string;
    colorway: string;
    latestCents: number | null;
    retailPriceCents: number;
  }>(db, sql`
    with latest as (
      select distinct on (pp.product_id) pp.product_id, pp.last_sale_cents
      from price_points pp
      where pp.platform_id = ${PRIMARY_PLATFORM}
      order by pp.product_id, pp.date desc
    )
    select
      p.id as "id",
      p.slug as "slug",
      p.name as "name",
      p.colorway as "colorway",
      p.retail_price_cents as "retailPriceCents",
      l.last_sale_cents as "latestCents"
    from products p
    left join latest l on l.product_id = p.id
    where p.silhouette = ${silhouette} and p.id <> ${productId}
    order by abs(coalesce(l.last_sale_cents, 0) - coalesce(
      (select last_sale_cents from price_points
        where product_id = ${productId} and platform_id = ${PRIMARY_PLATFORM}
        order by date desc limit 1), 0))
    limit ${limit}
  `);

  return result.rows.map((row) => {
    const latestCents = row.latestCents === null ? null : Number(row.latestCents);
    const retail = Number(row.retailPriceCents);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      colorway: row.colorway,
      latestCents,
      multiple: latestCents !== null && retail > 0 ? latestCents / retail : null,
    };
  });
}

/** Fetch several products at once, for the comparison view. */
export async function getProductsByIds(ids: string[]): Promise<ProductDetail[]> {
  if (ids.length === 0) return [];
  const results = await Promise.all(ids.map((id) => getProductByIdOrSlug(id)));
  return results.filter((p): p is ProductDetail => p !== null);
}

/**
 * Price sparklines for a set of products, in one query.
 *
 * The obvious implementation is a query per row, which for a 24-row table is 24
 * round trips to render a 60×20px decoration. One `= any($1)` with a window
 * filter and a group in JS is both faster and less code.
 */
export async function getSparklineSeries(
  productIds: string[],
  points = 14,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (productIds.length === 0) return out;

  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<{ productId: string; lastSaleCents: number }>(db, sql`
    with bounds as (
      select max(date) as as_of from price_points where platform_id = ${PRIMARY_PLATFORM}
    ),
    windowed as (
      select
        pp.product_id as "productId",
        pp.date,
        pp.last_sale_cents as "lastSaleCents",
        row_number() over (partition by pp.product_id order by pp.date desc) as rn
      from price_points pp, bounds b
      where pp.platform_id = ${PRIMARY_PLATFORM}
        and pp.product_id in (${sql.join(
          productIds.map((id) => sql`${id}`),
          sql`, `,
        )})
        and pp.date > b.as_of - 84
    )
    select "productId", "lastSaleCents"
    from windowed
    where rn <= ${points}
    order by "productId", date asc
  `);

  for (const row of result.rows) {
    const list = out.get(row.productId) ?? [];
    list.push(Number(row.lastSaleCents));
    out.set(row.productId, list);
  }

  return out;
}
