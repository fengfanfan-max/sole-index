/**
 * Fixture provider — reads the committed snapshot in ./fixtures.
 *
 * This is the default provider, and the reason the project has a working demo
 * and a deterministic test suite with no API key, no network and no quota.
 * See docs/adr/0001-provider-adapter.md for the reasoning.
 *
 * Server-side only: it touches the filesystem.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ProviderError,
  type DateRange,
  type MarketDataProvider,
  type NormalizedProduct,
  type PriceObservation,
  type ProviderCapabilities,
  type ProviderQuota,
  type SalesObservation,
  type SearchOptions,
} from './types';

/* -------------------------------------------------------------------------- */
/* Snapshot shapes                                                             */
/* -------------------------------------------------------------------------- */

export interface FixtureBrand {
  id: string;
  name: string;
  slug: string;
}

export interface FixtureCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface FixturePlatform {
  id: string;
  name: string;
  homepage: string | null;
}

export interface FixtureProduct extends NormalizedProduct {
  secondaryColor: string | null;
}

export interface FixtureSeries {
  /** Flat triples per week: [lowestAsk, highestBid, lastSale] in cents. */
  p: number[];
  /** Flat triples per week: [volume, avgSale, activeListings]. */
  s: number[];
}

export interface FixtureSnapshot {
  manifest: {
    generatedBy: string;
    seed: number;
    asOf: string;
    cadence: string;
    weeks: number;
    firstWeek: string;
    productCount: number;
    pricePointCount: number;
    salesPointCount: number;
    dataDisclaimer: string;
  };
  catalog: {
    brands: FixtureBrand[];
    categories: FixtureCategory[];
    platforms: FixturePlatform[];
    products: FixtureProduct[];
    profiles: Record<string, { profile: string; label: string }>;
    colorMeta: { key: string; label: string; hex: string }[];
    materialMeta: { key: string; label: string }[];
  };
  series: {
    asOf: string;
    firstWeek: string;
    cadence: string;
    weeks: number;
    series: Record<string, FixtureSeries>;
  };
  attributeTrends: {
    months: string[];
    points: {
      attribute: 'color' | 'material' | 'category';
      value: string;
      month: string;
      share: number;
      avgPriceCents: number;
      productCount: number;
    }[];
  };
  editorial: {
    users: {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'editor' | 'viewer';
      tier: 'free' | 'pro' | 'enterprise';
    }[];
    sources: {
      id: string;
      name: string;
      url: string | null;
      kind: 'api' | 'retailer' | 'editorial' | 'social' | 'analyst';
      notes: string | null;
    }[];
    insights: {
      id: string;
      kind: 'observation' | 'research' | 'market_note' | 'source_digest';
      title: string;
      body: string;
      authorId: string;
      sourceId: string | null;
      confidence: number;
      signal: string | null;
      status: 'draft' | 'published';
      publishedAt: string | null;
      links: {
        entityType: 'product' | 'category' | 'color' | 'material' | 'brand';
        entityId: string;
      }[];
    }[];
    articles: {
      id: string;
      slug: string;
      title: string;
      excerpt: string;
      body: string;
      coverImageUrl: string | null;
      authorId: string;
      categoryId: string | null;
      tags: string[];
      readingMinutes: number;
      status: 'draft' | 'published';
      publishedAt: string | null;
    }[];
  };
  ops: {
    ingestionRuns: {
      id: string;
      provider: string;
      status: 'running' | 'success' | 'failed';
      startedAt: string;
      finishedAt: string | null;
      productsUpserted: number;
      pricePointsUpserted: number;
      durationMs: number | null;
      error: string | null;
      quota: Record<string, number | string>;
    }[];
    featureFlags: {
      key: string;
      label: string;
      minTier: 'free' | 'pro' | 'enterprise';
      enabled: boolean;
    }[];
    subscriptions: {
      id: string;
      userId: string;
      tier: 'free' | 'pro' | 'enterprise';
      status: string;
      currentPeriodEnd: string;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
    }[];
  };
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

const FIXTURE_FILES = [
  'manifest.json',
  'catalog.json',
  'series.json',
  'attribute-trends.json',
  'editorial.json',
  'ops.json',
] as const;

function readJson<T>(dir: string, name: string): T {
  const path = resolve(dir, name);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    throw new ProviderError(
      `Could not read fixture "${name}" from ${dir}. Run \`pnpm fixtures:generate\` to rebuild the snapshot.`,
      { providerId: 'fixture', retryable: false, cause: error },
    );
  }
}

/** Process-lifetime cache — the snapshot is ~900 KiB and never changes. */
let cached: FixtureSnapshot | undefined;

export function loadSnapshot(dir = resolve(process.cwd(), 'fixtures')): FixtureSnapshot {
  if (cached) return cached;

  const manifest = readJson<FixtureSnapshot['manifest']>(dir, FIXTURE_FILES[0]);
  const catalog = readJson<FixtureSnapshot['catalog']>(dir, FIXTURE_FILES[1]);
  const series = readJson<FixtureSnapshot['series']>(dir, FIXTURE_FILES[2]);
  const attributeTrends = readJson<FixtureSnapshot['attributeTrends']>(dir, FIXTURE_FILES[3]);
  const editorial = readJson<FixtureSnapshot['editorial']>(dir, FIXTURE_FILES[4]);
  const ops = readJson<FixtureSnapshot['ops']>(dir, FIXTURE_FILES[5]);

  cached = { manifest, catalog, series, attributeTrends, editorial, ops };
  return cached;
}

/** Test helper — drop the cache so a regenerated snapshot is picked up. */
export function resetSnapshotCache(): void {
  cached = undefined;
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/* -------------------------------------------------------------------------- */

export const FIXTURE_PLATFORMS = ['stockx', 'goat', 'ebay'] as const;

/** Platforms whose full weekly series is seeded, versus sampled monthly. */
const PRIMARY_PLATFORM = 'stockx';
const SAMPLED_PLATFORMS = ['goat', 'ebay'] as const;
/** Every fourth week for the sampled platforms, to keep the row count sane. */
const SAMPLE_STRIDE = 4;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Deterministic per-platform basis, so cross-platform views are stable. */
function platformSkew(platformId: string): number {
  if (platformId === 'goat') return 0.035;
  if (platformId === 'ebay') return -0.055;
  return 0;
}

export function createFixtureProvider(
  dir = resolve(process.cwd(), 'fixtures'),
): MarketDataProvider {
  const snapshot = loadSnapshot(dir);
  const { series, catalog, manifest } = snapshot;

  const weekDates = Array.from({ length: manifest.weeks }, (_, i) =>
    addDays(manifest.firstWeek, i * 7),
  );

  const byId = new Map(catalog.products.map((p) => [p.id, p]));

  const capabilities: ProviderCapabilities = {
    priceHistory: true,
    salesHistory: true,
    crossPlatform: true,
    realtime: false,
    maxHistoryDays: manifest.weeks * 7,
    metered: false,
  };

  const quota: ProviderQuota = {
    limit: null,
    used: null,
    remaining: null,
    window: 'offline snapshot',
  };

  function inRange(date: string, range?: DateRange): boolean {
    if (!range) return true;
    if (range.from && date < range.from) return false;
    if (range.to && date > range.to) return false;
    return true;
  }

  function buildPriceHistory(productId: string, range?: DateRange): PriceObservation[] {
    const entry = series.series[productId];
    if (!entry) return [];
    const out: PriceObservation[] = [];

    const platforms: { id: string; stride: number }[] = [
      { id: PRIMARY_PLATFORM, stride: 1 },
      ...SAMPLED_PLATFORMS.map((id) => ({ id, stride: SAMPLE_STRIDE })),
    ];

    for (const { id: platformId, stride } of platforms) {
      const skew = platformSkew(platformId);
      for (let w = 0; w < manifest.weeks; w += stride) {
        const date = weekDates[w]!;
        if (!inRange(date, range)) continue;
        const ask = entry.p[w * 3] ?? 0;
        const bid = entry.p[w * 3 + 1] ?? 0;
        const sale = entry.p[w * 3 + 2] ?? 0;
        const scale = 1 + skew;
        out.push({
          productId,
          platformId,
          date,
          lowestAskCents: Math.round(ask * scale),
          highestBidCents: Math.round(bid * scale),
          lastSaleCents: Math.round(sale * scale),
        });
      }
    }

    return out;
  }

  function buildSalesHistory(productId: string, range?: DateRange): SalesObservation[] {
    const entry = series.series[productId];
    if (!entry) return [];
    const out: SalesObservation[] = [];

    for (let w = 0; w < manifest.weeks; w += 1) {
      const date = weekDates[w]!;
      if (!inRange(date, range)) continue;
      out.push({
        productId,
        platformId: PRIMARY_PLATFORM,
        date,
        volume: entry.s[w * 3] ?? 0,
        avgSaleCents: entry.s[w * 3 + 1] ?? 0,
        activeListings: entry.s[w * 3 + 2] ?? 0,
      });
    }

    return out;
  }

  return {
    id: 'fixture',
    label: 'Committed snapshot (offline)',
    capabilities,
    getQuota: () => quota,

    async searchProducts(query: string, options?: SearchOptions) {
      const needle = query.trim().toLowerCase();
      const limit = options?.limit ?? 50;
      return catalog.products
        .filter((p) => {
          if (options?.brandId && p.brandId !== options.brandId) return false;
          if (options?.categoryId && p.categoryId !== options.categoryId) return false;
          if (!needle) return true;
          return (
            p.name.toLowerCase().includes(needle) ||
            p.colorway.toLowerCase().includes(needle) ||
            p.silhouette.toLowerCase().includes(needle) ||
            p.id.toLowerCase().includes(needle)
          );
        })
        .slice(0, limit);
    },

    async getProduct(id: string) {
      return byId.get(id) ?? null;
    },

    async getPriceHistory(productId: string, range?: DateRange) {
      return buildPriceHistory(productId, range);
    },

    async getSalesHistory(productId: string, range?: DateRange) {
      return buildSalesHistory(productId, range);
    },
  };
}

/**
 * Materialise the whole snapshot into observation rows.
 *
 * Used by the seeder, which needs every product rather than one at a time.
 * Keeping it here means the demo database and the provider can never disagree
 * about what the data is.
 */
export async function materializeSnapshotAsync(
  dir = resolve(process.cwd(), 'fixtures'),
): Promise<{
  priceObservations: PriceObservation[];
  salesObservations: SalesObservation[];
}> {
  const provider = createFixtureProvider(dir);
  const snapshot = loadSnapshot(dir);

  const priceObservations: PriceObservation[] = [];
  const salesObservations: SalesObservation[] = [];

  for (const product of snapshot.catalog.products) {
    priceObservations.push(...(await provider.getPriceHistory(product.id)));
    salesObservations.push(...(await provider.getSalesHistory(product.id)));
  }

  return { priceObservations, salesObservations };
}
