/**
 * The market-data provider contract.
 *
 * Everything the application knows about where market data comes from is
 * expressed here. Two implementations exist (see docs/adr/0001):
 *
 *   - `fixture`  — reads the committed snapshot in ./fixtures
 *   - `kicksdb`  — calls the live KicksDB v3 API
 *
 * The point of the interface is that adding a third (`ebay`, `keepa`, an
 * internal warehouse) is a new file, not a refactor.
 */

/** A product as the rest of the app sees it, regardless of upstream shape. */
export interface NormalizedProduct {
  /** Style code from the upstream catalogue, e.g. "DZ5485-612". */
  id: string;
  slug: string;
  name: string;
  brandId: string;
  categoryId: string;
  silhouette: string;
  colorway: string;
  primaryColor: string;
  secondaryColor: string | null;
  materials: string[];
  releaseDate: string;
  retailPriceCents: number;
  currency: string;
  imageUrl: string | null;
  description: string | null;
}

export interface PriceObservation {
  productId: string;
  platformId: string;
  date: string;
  lowestAskCents: number;
  highestBidCents: number;
  lastSaleCents: number;
}

export interface SalesObservation {
  productId: string;
  platformId: string;
  date: string;
  volume: number;
  avgSaleCents: number;
  activeListings: number;
}

export interface DateRange {
  from?: string;
  to?: string;
}

export interface SearchOptions {
  limit?: number;
  brandId?: string;
  categoryId?: string;
}

/**
 * Declared abilities, so callers can degrade gracefully instead of discovering
 * a limitation through a thrown error mid-render.
 */
export interface ProviderCapabilities {
  priceHistory: boolean;
  salesHistory: boolean;
  /** Whether the provider returns more than one marketplace. */
  crossPlatform: boolean;
  /** Whether quotes are live rather than cached. */
  realtime: boolean;
  /** How far back history reliably goes, in days. */
  maxHistoryDays: number;
  /** Whether calls consume a metered quota. */
  metered: boolean;
}

export interface ProviderQuota {
  limit: number | null;
  used: number | null;
  remaining: number | null;
  window: string | null;
}

export interface MarketDataProvider {
  readonly id: string;
  readonly label: string;
  readonly capabilities: ProviderCapabilities;

  searchProducts(
    query: string,
    options?: SearchOptions,
  ): Promise<NormalizedProduct[]>;

  getProduct(id: string): Promise<NormalizedProduct | null>;

  getPriceHistory(
    productId: string,
    range?: DateRange,
  ): Promise<PriceObservation[]>;

  getSalesHistory(
    productId: string,
    range?: DateRange,
  ): Promise<SalesObservation[]>;

  /** Last observed quota state, when the provider reports one. */
  getQuota?(): ProviderQuota;
}

/**
 * Thrown by providers for upstream failures. Carries `retryable` so the
 * ingestion job can decide whether to back off or to fail the run.
 */
export class ProviderError extends Error {
  readonly providerId: string;
  readonly statusCode: number | null;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      providerId: string;
      statusCode?: number | null;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'ProviderError';
    this.providerId = options.providerId;
    this.statusCode = options.statusCode ?? null;
    this.retryable = options.retryable ?? false;
  }
}
