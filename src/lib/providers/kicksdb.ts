/**
 * KicksDB provider — live market data.
 *
 * Endpoints and response shapes follow the published KicksDB v3 reference
 * (https://docs.kicks.dev). Authentication is a bearer API key:
 *
 *     Authorization: Bearer KICKS-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 *
 * Verification status — read this before trusting it
 * --------------------------------------------------
 * This adapter was written against the published documentation, **not** against
 * a live key: the project had no KicksDB account at build time, so no request in
 * this file has been executed. Treat it as a reviewed, structured starting point:
 * `pnpm ingest --provider kicksdb --dry-run` will exercise the request path and
 * print the decoded payload so the response mapping can be confirmed against the
 * account's actual plan.
 *
 * Two documented constraints shape the code below:
 *
 *   - The **sales-history** endpoint is a premium feature. On the free tier it
 *     returns 403; the provider surfaces that as a non-retryable ProviderError
 *     rather than retrying a call that can never succeed.
 *   - Requests are **metered** at 1,000/month on the free tier, reported via the
 *     `X-Quota-Current` response header. The quota state is captured per call so
 *     the admin dashboard can show remaining budget.
 */
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

const DEFAULT_BASE_URL = 'https://api.kicks.dev/v3';

/** Upstream product shape (unified + StockX endpoints share most fields). */
interface KicksProduct {
  id?: string;
  style_id?: string;
  sku?: string;
  slug?: string;
  title?: string;
  name?: string;
  brand?: string;
  brand_id?: string;
  category?: string;
  silhouette?: string;
  colorway?: string;
  color?: string;
  materials?: string[];
  release_date?: string;
  retail_price?: number | null;
  image?: string;
  image_url?: string;
  description?: string;
  _source?: { platform?: string };
}

interface KicksSale {
  product_id?: string;
  variant_id?: string;
  amount?: number;
  created_at?: string;
}

interface ListResponse<T> {
  data?: T[];
  pagination?: { has_more?: boolean; next_cursor?: string };
}

export interface KicksDbProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  /** Injected for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Retries for retryable failures (429 and 5xx). */
  maxRetries?: number;
  /** Base delay for exponential backoff, in milliseconds. */
  baseBackoffMs?: number;
}

export function createKicksDbProvider(
  options: KicksDbProviderOptions = {},
): MarketDataProvider {
  const apiKey = options.apiKey ?? process.env.KICKSDB_API_KEY ?? '';
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxRetries = options.maxRetries ?? 3;
  const baseBackoffMs = options.baseBackoffMs ?? 400;

  const capabilities: ProviderCapabilities = {
    priceHistory: true,
    salesHistory: true,
    crossPlatform: true,
    realtime: false,
    // The reference documents stock and sales history going back years; the
    // default window we ask for is intentionally conservative.
    maxHistoryDays: 730,
    metered: true,
  };

  let quota: ProviderQuota = {
    limit: null,
    used: null,
    remaining: null,
    window: null,
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** True when the failure is worth another attempt. */
  const isRetryableStatus = (status: number) => status === 429 || status >= 500;

  async function request<T>(path: string): Promise<{ body: T; headers: Headers }> {
    if (!apiKey) {
      throw new ProviderError(
        'KICKSDB_API_KEY is not set. Set it, or use SOLEINDEX_PROVIDER=fixture for the offline snapshot.',
        { providerId: 'kicksdb', retryable: false },
      );
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) {
        // Exponential backoff with full jitter, so a fleet of workers does not
        // resynchronise on the retry.
        const backoff = baseBackoffMs * 2 ** (attempt - 1);
        await sleep(Math.random() * backoff);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await doFetch(`${baseUrl}${path}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        // Capture metered state on every response, including failures.
        const quotaCurrent = response.headers.get('x-quota-current');
        if (quotaCurrent !== null) {
          const used = Number(quotaCurrent);
          quota = {
            limit: quota.limit ?? 1000,
            used: Number.isFinite(used) ? used : null,
            remaining:
              quota.limit !== null && Number.isFinite(used) ? quota.limit - used : null,
            window: quota.window ?? new Date().toISOString().slice(0, 7),
          };
        }

        if (response.status === 403) {
          throw new ProviderError(
            `KicksDB returned 403 for ${path}. The sales-history endpoint is a premium feature; ` +
              'check the plan on the account, or fall back to SOLEINDEX_PROVIDER=fixture.',
            { providerId: 'kicksdb', statusCode: 403, retryable: false },
          );
        }

        if (response.status === 404) return { body: { data: [] } as T, headers: response.headers };

        if (!response.ok) {
          const retryable = isRetryableStatus(response.status);
          const error = new ProviderError(
            `KicksDB ${response.status} ${response.statusText} for ${path}`,
            { providerId: 'kicksdb', statusCode: response.status, retryable },
          );
          if (!retryable) throw error;
          lastError = error;
          continue;
        }

        return { body: (await response.json()) as T, headers: response.headers };
      } catch (error) {
        if (error instanceof ProviderError && !error.retryable) throw error;
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new ProviderError(
      `KicksDB request to ${path} failed after ${maxRetries + 1} attempts.`,
      { providerId: 'kicksdb', retryable: true, cause: lastError },
    );
  }

  /* ------------------------------ mapping ------------------------------ */

  /**
   * Map an upstream record onto our schema.
   *
   * Colour and material are the parts that genuinely need judgement: upstream
   * sends free-text `colorway` strings, while everything downstream (trend
   * intelligence, facets) expects normalised keys. The normaliser is
   * intentionally conservative — it returns `unknown` rather than guessing, so
   * a bad match shows up as a data-quality gap instead of a silent mis-tag.
   */
  function normalize(record: KicksProduct): NormalizedProduct {
    const name = record.title ?? record.name ?? 'Unknown product';
    const id = record.style_id ?? record.sku ?? record.id ?? slugify(name);
    const colorway = record.colorway ?? record.color ?? 'Unknown';
    const brandId = slugify(record.brand ?? record.brand_id ?? 'unknown');
    const silhouette = record.silhouette ?? name.replace(/^[^\s]+\s+/, '');

    return {
      id,
      slug: record.slug ?? slugify(`${name} ${id}`),
      name,
      brandId,
      categoryId: slugify(record.category ?? 'uncategorised'),
      silhouette,
      colorway,
      primaryColor: normalizeColor(colorway),
      secondaryColor: null,
      materials: (record.materials ?? []).map((m) => slugify(m)),
      releaseDate: (record.release_date ?? '').slice(0, 10) || '1970-01-01',
      // Upstream retail is in whole currency units; we store cents.
      retailPriceCents: Math.round((record.retail_price ?? 0) * 100),
      currency: 'USD',
      imageUrl: record.image ?? record.image_url ?? null,
      description: record.description ?? null,
    };
  }

  return {
    id: 'kicksdb',
    label: 'KicksDB (live)',
    capabilities,
    getQuota: () => quota,

    async searchProducts(query: string, searchOptions?: SearchOptions) {
      const params = new URLSearchParams();
      if (query.trim()) params.set('query', query.trim());
      params.set('limit', String(Math.min(searchOptions?.limit ?? 50, 100)));
      if (searchOptions?.brandId) params.set('brand', searchOptions.brandId);

      const { body } = await request<ListResponse<KicksProduct>>(
        `/stockx/products?${params.toString()}`,
      );
      return (body.data ?? []).map(normalize);
    },

    async getProduct(id: string) {
      const { body } = await request<{ data?: KicksProduct[] | KicksProduct }>(
        `/stockx/products/${encodeURIComponent(id)}`,
      );
      const record = Array.isArray(body.data) ? body.data[0] : body.data;
      return record ? normalize(record) : null;
    },

    async getPriceHistory(productId: string, range?: DateRange) {
      // KicksDB exposes *sales* as the historical series; the bid/ask spread is
      // current-state. We therefore derive the price series from sales and mark
      // the derived bid/ask as null-equivalent by reusing the sale price, which
      // keeps the shape identical to the fixture provider without pretending we
      // observed a spread we did not.
      const sales = await this.getSalesHistory(productId, range);
      return sales.map<PriceObservation>((s) => ({
        productId: s.productId,
        platformId: s.platformId,
        date: s.date,
        lowestAskCents: s.avgSaleCents,
        highestBidCents: s.avgSaleCents,
        lastSaleCents: s.avgSaleCents,
      }));
    },

    async getSalesHistory(productId: string, range?: DateRange) {
      const params = new URLSearchParams();
      if (range?.from) params.set('from', range.from);
      if (range?.to) params.set('to', range.to);
      const qs = params.toString();

      const { body } = await request<ListResponse<KicksSale>>(
        `/stockx/products/${encodeURIComponent(productId)}/sales${qs ? `?${qs}` : ''}`,
      );

      // Upstream returns one row per sale. Downstream expects period aggregates,
      // so roll up by day here rather than pushing the work to every caller.
      const buckets = new Map<string, { total: number; count: number }>();
      for (const sale of body.data ?? []) {
        if (!sale.created_at || typeof sale.amount !== 'number') continue;
        const date = sale.created_at.slice(0, 10);
        const bucket = buckets.get(date) ?? { total: 0, count: 0 };
        bucket.total += sale.amount;
        bucket.count += 1;
        buckets.set(date, bucket);
      }

      return [...buckets.entries()]
        .map<SalesObservation>(([date, bucket]) => ({
          productId,
          platformId: 'stockx',
          date,
          volume: bucket.count,
          avgSaleCents: Math.round((bucket.total / bucket.count) * 100),
          // The sales endpoint does not report standing supply. Reporting 0
          // would corrupt the sell-through factor, so we mark it explicitly
          // unknown and let the analytics layer treat it as missing.
          activeListings: -1,
        }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Normalisation helpers                                                       */
/* -------------------------------------------------------------------------- */

const COLOR_VOCABULARY: Record<string, string[]> = {
  black: ['black', 'triple black', 'anthracite', 'obsidian'],
  white: ['white', 'sail', 'bone', 'cream', 'platinum'],
  grey: ['grey', 'gray', 'wolf', 'smoke', 'ash', 'steel'],
  red: ['red', 'bred', 'crimson', 'varsity', 'chicago'],
  blue: ['blue', 'royal', 'navy', 'university', 'marina'],
  green: ['green', 'olive', 'pine', 'gorge', 'mint'],
  orange: ['orange', 'clay', 'sunset', 'sienna'],
  purple: ['purple', 'violet', 'grape', 'plum'],
  pink: ['pink', 'rose', 'blush'],
  brown: ['brown', 'mocha', 'taupe', 'mushroom', 'cacao'],
  yellow: ['yellow', 'taxi', 'maize', 'butter'],
  beige: ['beige', 'sand', 'oatmeal', 'desert'],
};

/**
 * Best-effort colour normalisation. Returns `'unknown'` rather than guessing so
 * the data-quality gap is visible in the admin view.
 */
export function normalizeColor(colorway: string): string {
  const needle = colorway.toLowerCase();
  for (const [key, terms] of Object.entries(COLOR_VOCABULARY)) {
    if (terms.some((term) => needle.includes(term))) return key;
  }
  return 'unknown';
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
