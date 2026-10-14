/**
 * Entitlements.
 *
 * Feature flags live in the database (`feature_flags`) rather than in code, so
 * the paywall can be reconfigured without a deploy — and so the admin surface
 * has something real to show. Each flag declares a `minTier`; a session's tier
 * is compared against it.
 *
 * The gate is enforced **server-side** in the page that renders the gated
 * content. The locked state is a real absence of data, not a CSS blur over data
 * that was already sent to the browser — a distinction that matters, because the
 * latter is the most common way a paywall demo turns out to be fake.
 */
import { sql } from 'drizzle-orm';

import { ensureDatabaseReady } from '@/db/bootstrap';
import { getDb } from '@/db/client';

import { hasTier, type Session, type UserTier } from './session';

export interface Entitlement {
  key: string;
  label: string;
  minTier: UserTier;
  enabled: boolean;
  granted: boolean;
}

export async function getEntitlements(session: Session): Promise<Entitlement[]> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await db.execute<{
    key: string;
    label: string;
    minTier: UserTier;
    enabled: boolean;
  }>(sql`
    select key, label, min_tier as "minTier", enabled
    from feature_flags
    order by
      case min_tier when 'free' then 0 when 'pro' then 1 else 2 end,
      label asc
  `);

  return result.rows.map((row) => ({
    ...row,
    granted: row.enabled && hasTier(session, row.minTier),
  }));
}

/** Convenience for a single flag. Unknown keys are denied. */
export async function can(
  session: Session,
  featureKey: string,
): Promise<boolean> {
  const entitlements = await getEntitlements(session);
  return entitlements.find((e) => e.key === featureKey)?.granted ?? false;
}

export const TIER_ORDER: readonly UserTier[] = ['free', 'pro', 'enterprise'];

export const PRICING_TIERS: {
  tier: UserTier;
  name: string;
  priceMonthly: number;
  tagline: string;
  highlights: string[];
}[] = [
  {
    tier: 'free',
    name: 'Free',
    priceMonthly: 0,
    tagline: 'Read the market.',
    highlights: [
      'Market dashboard and index',
      'Full catalogue search and filtering',
      'Multi-product comparison (up to 4)',
      'Published editorial',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    priceMonthly: 49,
    tagline: 'Work the market.',
    highlights: [
      'Everything in Free',
      'Trend Momentum Index and rankings',
      'Colour and material share series',
      'CSV export and API access',
      'Author analyst observations',
    ],
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 199,
    tagline: 'Automate the market.',
    highlights: [
      'Everything in Pro',
      'AI-generated market summaries',
      'Custom price and supply alerts',
      'Unlimited seats and audit log',
      'Priority ingestion and SLA',
    ],
  },
];
