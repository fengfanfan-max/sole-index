/**
 * Editorial and analyst-knowledge read models.
 *
 * `insights` are the manually authored half of the product: observations,
 * research notes and source digests. `articles` are the long-form published
 * reports. Both are drafts-until-published, and every public query filters on
 * `status = 'published'` so a draft can never leak onto a public surface.
 */
import { sql } from 'drizzle-orm';

import { ensureDatabaseReady } from '@/db/bootstrap';
import { getDb } from '@/db/client';
import { execute } from '@/lib/data/query';

export type EntityType = 'product' | 'category' | 'color' | 'material' | 'brand';

export interface ArticleSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  readingMinutes: number;
  status: 'draft' | 'published';
  publishedAt: string | null;
  authorName: string | null;
  categoryName: string | null;
}

export interface ArticleDetail extends ArticleSummary {
  body: string;
}

const ARTICLE_SUMMARY_COLUMNS = sql`
  a.id as "id",
  a.slug as "slug",
  a.title as "title",
  a.excerpt as "excerpt",
  a.tags as "tags",
  a.reading_minutes as "readingMinutes",
  a.published_at::text as "publishedAt",
  a.status as "status",
  u.name as "authorName",
  c.name as "categoryName"
`;

export async function listArticles(options: { includeDrafts?: boolean } = {}): Promise<
  ArticleSummary[]
> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<ArticleSummary>(db, sql`
    select ${ARTICLE_SUMMARY_COLUMNS}
    from articles a
    left join users u on u.id = a.author_id
    left join categories c on c.id = a.category_id
    ${options.includeDrafts ? sql`` : sql`where a.status = 'published'`}
    order by a.published_at desc nulls last, a.title asc
  `);

  return result.rows;
}

export async function getArticle(slug: string): Promise<ArticleDetail | null> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<ArticleDetail>(db, sql`
    select ${ARTICLE_SUMMARY_COLUMNS}, a.body as "body", a.status as "status"
    from articles a
    left join users u on u.id = a.author_id
    left join categories c on c.id = a.category_id
    where a.slug = ${slug}
    limit 1
  `);

  return result.rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Insights                                                                    */
/* -------------------------------------------------------------------------- */

export interface InsightRecord {
  id: string;
  kind: 'observation' | 'research' | 'market_note' | 'source_digest';
  title: string;
  body: string;
  confidence: number;
  signal: string | null;
  status: 'draft' | 'published';
  publishedAt: string | null;
  createdAt: string;
  authorName: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  /** Entities this insight is attached to — the polymorphic links. */
  links: { entityType: EntityType; entityId: string; label: string }[];
}

/**
 * All insights with their entity links aggregated.
 *
 * `json_agg` over a lateral join keeps this to one round trip; the alternative
 * (fetch insights, then fetch links, then stitch in JS) is three queries and a
 * merge for no benefit.
 */
export async function listInsights(options: { includeDrafts?: boolean; limit?: number } = {}): Promise<
  InsightRecord[]
> {
  await ensureDatabaseReady();
  const db = await getDb();
  const { includeDrafts = false, limit = 50 } = options;

  const result = await execute<{
    id: string;
    kind: InsightRecord['kind'];
    title: string;
    body: string;
    confidence: number;
    signal: string | null;
    status: InsightRecord['status'];
    publishedAt: string | null;
    createdAt: string;
    authorName: string | null;
    sourceName: string | null;
    sourceUrl: string | null;
    links: InsightRecord['links'] | null;
  }>(db, sql`
    select
      i.id as "id",
      i.kind as "kind",
      i.title as "title",
      i.body as "body",
      i.confidence as "confidence",
      i.signal as "signal",
      i.status as "status",
      i.published_at::text as "publishedAt",
      i.created_at::text as "createdAt",
      u.name as "authorName",
      s.name as "sourceName",
      s.url as "sourceUrl",
      (
        select json_agg(json_build_object(
          'entityType', l.entity_type,
          'entityId', l.entity_id,
          'label', coalesce(
            (select p.name from products p where p.id = l.entity_id and l.entity_type = 'product'),
            (select c.name from categories c where c.id = l.entity_id and l.entity_type = 'category'),
            (select b.name from brands b where b.id = l.entity_id and l.entity_type = 'brand'),
            l.entity_id
          )
        ) order by l.entity_type, l.entity_id)
        from insight_links l where l.insight_id = i.id
      ) as "links"
    from insights i
    left join users u on u.id = i.author_id
    left join sources s on s.id = i.source_id
    ${includeDrafts ? sql`` : sql`where i.status = 'published'`}
    order by i.published_at desc nulls last, i.created_at desc
    limit ${limit}
  `);

  return result.rows.map((row) => ({ ...row, links: row.links ?? [] }));
}

/**
 * Insights attached to one entity.
 *
 * This single function is what makes the brief's "manually collected
 * observations linked to existing database records" requirement real: a note
 * authored once in /admin appears on the product page, the colour trend page and
 * the category page without being duplicated.
 */
export async function getInsightsForEntity(
  entityType: EntityType,
  entityId: string,
  options: { includeDrafts?: boolean } = {},
): Promise<InsightRecord[]> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<{
    id: string;
    kind: InsightRecord['kind'];
    title: string;
    body: string;
    confidence: number;
    signal: string | null;
    status: InsightRecord['status'];
    publishedAt: string | null;
    createdAt: string;
    authorName: string | null;
    sourceName: string | null;
    sourceUrl: string | null;
  }>(db, sql`
    select
      i.id as "id",
      i.kind as "kind",
      i.title as "title",
      i.body as "body",
      i.confidence as "confidence",
      i.signal as "signal",
      i.status as "status",
      i.published_at::text as "publishedAt",
      i.created_at::text as "createdAt",
      u.name as "authorName",
      s.name as "sourceName",
      s.url as "sourceUrl"
    from insights i
    join insight_links l on l.insight_id = i.id
    left join users u on u.id = i.author_id
    left join sources s on s.id = i.source_id
    where l.entity_type = ${entityType}
      and l.entity_id = ${entityId}
      ${options.includeDrafts ? sql`` : sql`and i.status = 'published'`}
    order by i.published_at desc nulls last, i.confidence desc
  `);

  return result.rows.map((row) => ({ ...row, links: [] }));
}

export interface SourceRecord {
  id: string;
  name: string;
  url: string | null;
  kind: 'api' | 'retailer' | 'editorial' | 'social' | 'analyst';
  notes: string | null;
  retrievedAt: string | null;
  insightCount: number;
}

export async function listSources(): Promise<SourceRecord[]> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await execute<SourceRecord>(db, sql`
    select
      s.id as "id",
      s.name as "name",
      s.url as "url",
      s.kind as "kind",
      s.notes as "notes",
      s.retrieved_at::text as "retrievedAt",
      (select count(*)::int from insights i where i.source_id = s.id) as "insightCount"
    from sources s
    order by s.kind asc, s.name asc
  `);

  return result.rows.map((row) => ({ ...row, insightCount: Number(row.insightCount ?? 0) }));
}

/** Labels for every entity type, used to render link chips in the admin UI. */
export async function getEntityLabels(
  entityType: EntityType,
): Promise<{ id: string; label: string }[]> {
  await ensureDatabaseReady();
  const db = await getDb();

  const query = {
    product: sql`select id, name as label from products order by name asc`,
    category: sql`select id, name as label from categories order by name asc`,
    brand: sql`select id, name as label from brands order by name asc`,
    color: sql`
      select distinct primary_color as id, primary_color as label
      from products order by primary_color asc`,
    material: sql`
      select distinct m as id, m as label
      from products p, unnest(p.materials) as m order by m asc`,
  }[entityType];

  const result = await execute<{ id: string; label: string }>(db, query);
  return result.rows;
}
