/**
 * Provider factory.
 *
 * Selection is by environment variable so the same build can run offline (demo,
 * CI, tests) or against live data (production ingestion) without a code change.
 */
import { createFixtureProvider } from './fixture';
import { createKicksDbProvider } from './kicksdb';
import type { MarketDataProvider } from './types';

export type ProviderId = 'fixture' | 'kicksdb';

/** Providers that can be selected by id. */
export const PROVIDER_IDS: readonly ProviderId[] = ['fixture', 'kicksdb'];

export function activeProviderId(): ProviderId {
  const raw = (process.env.SOLEINDEX_PROVIDER ?? 'fixture').trim().toLowerCase();
  return PROVIDER_IDS.includes(raw as ProviderId) ? (raw as ProviderId) : 'fixture';
}

const cache = new Map<ProviderId, MarketDataProvider>();

/** Returns a cached provider instance for the given id (default: configured). */
export function getProvider(id?: ProviderId): MarketDataProvider {
  const resolved = id ?? activeProviderId();
  const existing = cache.get(resolved);
  if (existing) return existing;

  const provider =
    resolved === 'kicksdb' ? createKicksDbProvider() : createFixtureProvider();
  cache.set(resolved, provider);
  return provider;
}

/** Test helper. */
export function resetProviderCache(): void {
  cache.clear();
}

export * from './types';
export { createFixtureProvider, loadSnapshot, materializeSnapshotAsync } from './fixture';
export { createKicksDbProvider, normalizeColor } from './kicksdb';
