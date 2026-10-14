/**
 * SoleIndex database schema — PostgreSQL dialect.
 *
 * Design notes (see docs/architecture.md for the long form):
 *
 * 1. The schema is written against **PostgreSQL**, not SQLite. Local development
 *    runs an embedded PostgreSQL (PGlite, WASM) so the semantics are identical to
 *    production; deploying only swaps the connection string.
 *
 * 2. Money is stored as **integer cents**. Never floats for currency.
 *
 * 3. Dates that represent a calendar day use `date`. Timestamps use
 *    `timestamptz`. Both are read back as ISO strings so they can cross the
 *    React Server Component boundary without serialization surprises.
 *
 * 4. `insight_links` is the polymorphic join that satisfies the brief's
 *    "link manually collected observations to existing database records".
 *    One insight can attach to a product, a category, a colour, a material
 *    or a brand — and it then surfaces on every one of those pages.
 */
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const userRoleEnum = pgEnum('user_role', ['admin', 'editor', 'viewer']);

export const userTierEnum = pgEnum('user_tier', ['free', 'pro', 'enterprise']);

export const publishStatusEnum = pgEnum('publish_status', ['draft', 'published']);

export const insightKindEnum = pgEnum('insight_kind', [
  'observation',
  'research',
  'market_note',
  'source_digest',
]);

export const entityTypeEnum = pgEnum('entity_type', [
  'product',
  'category',
  'color',
  'material',
  'brand',
]);

export const sourceKindEnum = pgEnum('source_kind', [
  'api',
  'retailer',
  'editorial',
  'social',
  'analyst',
]);

export const ingestionStatusEnum = pgEnum('ingestion_status', [
  'running',
  'success',
  'failed',
]);

export const trendAttributeEnum = pgEnum('trend_attribute', [
  'color',
  'material',
  'category',
]);

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: userRoleEnum('role').notNull().default('viewer'),
  tier: userTierEnum('tier').notNull().default('free'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

/**
 * Billing record. Deliberately shaped like a Stripe subscription so the
 * `stripe_*` columns can be filled in without a schema change.
 */
export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tier: userTierEnum('tier').notNull(),
  status: text('status').notNull().default('active'),
  currentPeriodEnd: timestamp('current_period_end', {
    withTimezone: true,
    mode: 'string',
  }),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                   */
/* -------------------------------------------------------------------------- */

export const brands = pgTable('brands', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
});

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
});

/** Resale platforms we aggregate. KicksDB fronts most of these. */
export const platforms = pgTable('platforms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  homepage: text('homepage'),
});

export const products = pgTable(
  'products',
  {
    /** Style code, e.g. "DZ5485-612". Doubles as the external provider id. */
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    silhouette: text('silhouette').notNull(),
    colorway: text('colorway').notNull(),
    /** Normalised primary/secondary colour keys, used by trend intelligence. */
    primaryColor: text('primary_color').notNull(),
    secondaryColor: text('secondary_color'),
    /** Normalised material keys, e.g. ['leather','suede']. */
    materials: text('materials').array().notNull().default(sql`'{}'::text[]`),
    releaseDate: date('release_date', { mode: 'string' }).notNull(),
    retailPriceCents: integer('retail_price_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    imageUrl: text('image_url'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('products_slug_idx').on(t.slug),
    index('products_brand_idx').on(t.brandId),
    index('products_category_idx').on(t.categoryId),
    index('products_primary_color_idx').on(t.primaryColor),
    index('products_release_date_idx').on(t.releaseDate),
  ],
);

/* -------------------------------------------------------------------------- */
/* Market data                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One observation of a product's price on one platform on one day.
 *
 * The demo dataset seeds weekly points (Monday-anchored) over 18 months; the
 * column granularity is daily because that is what the live providers return.
 */
export const pricePoints = pgTable(
  'price_points',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    platformId: text('platform_id')
      .notNull()
      .references(() => platforms.id, { onDelete: 'restrict' }),
    date: date('date', { mode: 'string' }).notNull(),
    lowestAskCents: integer('lowest_ask_cents').notNull(),
    highestBidCents: integer('highest_bid_cents').notNull(),
    lastSaleCents: integer('last_sale_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('price_points_unique_idx').on(t.productId, t.platformId, t.date),
    index('price_points_date_idx').on(t.date),
    index('price_points_product_date_idx').on(t.productId, t.date),
  ],
);

/** Aggregated sell-through per product per period. */
export const salesPoints = pgTable(
  'sales_points',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    platformId: text('platform_id')
      .notNull()
      .references(() => platforms.id, { onDelete: 'restrict' }),
    date: date('date', { mode: 'string' }).notNull(),
    volume: integer('volume').notNull(),
    avgSaleCents: integer('avg_sale_cents').notNull(),
    /** Units currently listed for sale — the denominator of sell-through. */
    activeListings: integer('active_listings').notNull(),
  },
  (t) => [
    uniqueIndex('sales_points_unique_idx').on(t.productId, t.platformId, t.date),
    index('sales_points_product_date_idx').on(t.productId, t.date),
  ],
);

/**
 * Share-of-catalogue time series per colour / material / category.
 * Powers the "Trend Intelligence" surface without recomputing on every request.
 */
export const attributeTrends = pgTable(
  'attribute_trends',
  {
    id: text('id').primaryKey(),
    attribute: trendAttributeEnum('attribute').notNull(),
    value: text('value').notNull(),
    /** First day of the month. */
    month: date('month', { mode: 'string' }).notNull(),
    share: numeric('share', { precision: 6, scale: 4 }).notNull(),
    avgPriceCents: integer('avg_price_cents').notNull(),
    productCount: integer('product_count').notNull(),
  },
  (t) => [
    uniqueIndex('attribute_trends_unique_idx').on(t.attribute, t.value, t.month),
    index('attribute_trends_month_idx').on(t.month),
  ],
);

/**
 * Materialised Trend Momentum Index results, written by the analytics job.
 * The formula lives in src/lib/analytics/tmi.ts and is unit tested.
 */
export const trendScores = pgTable(
  'trend_scores',
  {
    id: text('id').primaryKey(),
    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    windowDays: integer('window_days').notNull(),
    /** Composite 0–100 score. */
    score: numeric('score', { precision: 6, scale: 2 }).notNull(),
    /** Per-factor contributions, so the UI can explain the number. */
    components: jsonb('components')
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    computedAt: timestamp('computed_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('trend_scores_unique_idx').on(
      t.entityType,
      t.entityId,
      t.windowDays,
    ),
    index('trend_scores_score_idx').on(t.score),
  ],
);

/* -------------------------------------------------------------------------- */
/* Editorial + analyst knowledge                                               */
/* -------------------------------------------------------------------------- */

export const sources = pgTable('sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url'),
  kind: sourceKindEnum('kind').notNull(),
  retrievedAt: timestamp('retrieved_at', { withTimezone: true, mode: 'string' }),
  notes: text('notes'),
});

export const insights = pgTable(
  'insights',
  {
    id: text('id').primaryKey(),
    kind: insightKindEnum('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    authorId: text('author_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    sourceId: text('source_id').references(() => sources.id, {
      onDelete: 'set null',
    }),
    /** Analyst conviction, 1–5. Rendered as a confidence meter. */
    confidence: integer('confidence').notNull().default(3),
    /** Free-form metric the analyst is asserting, e.g. "-12% supply". */
    signal: text('signal'),
    status: publishStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('insights_status_idx').on(t.status),
    index('insights_published_at_idx').on(t.publishedAt),
    index('insights_kind_idx').on(t.kind),
  ],
);

/**
 * The polymorphic join that links an insight to any catalogue entity.
 * `entity_id` is intentionally not a foreign key — it points at different
 * tables depending on `entity_type`.
 */
export const insightLinks = pgTable(
  'insight_links',
  {
    id: text('id').primaryKey(),
    insightId: text('insight_id')
      .notNull()
      .references(() => insights.id, { onDelete: 'cascade' }),
    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
  },
  (t) => [
    uniqueIndex('insight_links_unique_idx').on(
      t.insightId,
      t.entityType,
      t.entityId,
    ),
    index('insight_links_entity_idx').on(t.entityType, t.entityId),
  ],
);

export const articles = pgTable(
  'articles',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    excerpt: text('excerpt').notNull(),
    /** MDX-ish markdown body. Rendered by the editorial route. */
    body: text('body').notNull(),
    coverImageUrl: text('cover_image_url'),
    authorId: text('author_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    categoryId: text('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    readingMinutes: integer('reading_minutes').notNull().default(5),
    status: publishStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('articles_slug_idx').on(t.slug),
    index('articles_status_published_idx').on(t.status, t.publishedAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Operations                                                                  */
/* -------------------------------------------------------------------------- */

/** Audit log for every provider sync. Surfaced on /admin. */
export const ingestionRuns = pgTable(
  'ingestion_runs',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    status: ingestionStatusEnum('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', {
      withTimezone: true,
      mode: 'string',
    }),
    productsUpserted: integer('products_upserted').notNull().default(0),
    pricePointsUpserted: integer('price_points_upserted').notNull().default(0),
    durationMs: integer('duration_ms'),
    error: text('error'),
    /** Provider-reported quota state, so the admin can see remaining budget. */
    quota: jsonb('quota').$type<Record<string, number | string>>(),
  },
  (t) => [index('ingestion_runs_started_at_idx').on(t.startedAt)],
);

/** Feature flags for the demo paywall. */
export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  /** Minimum tier required to unlock. */
  minTier: userTierEnum('min_tier').notNull().default('free'),
  enabled: boolean('enabled').notNull().default(true),
});

/* -------------------------------------------------------------------------- */
/* Relations                                                                   */
/* -------------------------------------------------------------------------- */

export const brandRelations = relations(brands, ({ many }) => ({
  products: many(products),
}));

export const categoryRelations = relations(categories, ({ many }) => ({
  products: many(products),
  articles: many(articles),
}));

export const productRelations = relations(products, ({ one, many }) => ({
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  pricePoints: many(pricePoints),
  salesPoints: many(salesPoints),
}));

export const pricePointRelations = relations(pricePoints, ({ one }) => ({
  product: one(products, {
    fields: [pricePoints.productId],
    references: [products.id],
  }),
  platform: one(platforms, {
    fields: [pricePoints.platformId],
    references: [platforms.id],
  }),
}));

export const insightRelations = relations(insights, ({ one, many }) => ({
  author: one(users, { fields: [insights.authorId], references: [users.id] }),
  source: one(sources, {
    fields: [insights.sourceId],
    references: [sources.id],
  }),
  links: many(insightLinks),
}));

export const insightLinkRelations = relations(insightLinks, ({ one }) => ({
  insight: one(insights, {
    fields: [insightLinks.insightId],
    references: [insights.id],
  }),
}));

export const articleRelations = relations(articles, ({ one }) => ({
  author: one(users, { fields: [articles.authorId], references: [users.id] }),
  category: one(categories, {
    fields: [articles.categoryId],
    references: [categories.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/* Inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Brand = typeof brands.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Platform = typeof platforms.$inferSelect;
export type PricePoint = typeof pricePoints.$inferSelect;
export type SalesPoint = typeof salesPoints.$inferSelect;
export type AttributeTrend = typeof attributeTrends.$inferSelect;
export type TrendScore = typeof trendScores.$inferSelect;
export type Insight = typeof insights.$inferSelect;
export type InsightLink = typeof insightLinks.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type IngestionRun = typeof ingestionRuns.$inferSelect;
export type FeatureFlag = typeof featureFlags.$inferSelect;

export const schema = {
  users,
  subscriptions,
  brands,
  categories,
  platforms,
  products,
  pricePoints,
  salesPoints,
  attributeTrends,
  trendScores,
  sources,
  insights,
  insightLinks,
  articles,
  ingestionRuns,
  featureFlags,
};

export { primaryKey };
