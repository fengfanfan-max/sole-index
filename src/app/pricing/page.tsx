/**
 * Plans.
 *
 * Entitlements are read from the `feature_flags` table and evaluated against the
 * session tier, so this page is a view of the same server-side gate the rest of
 * the app enforces — not a marketing page that describes a gate it does not have.
 */
import Link from 'next/link';

import { PageHeader } from '@/components/cards';
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Table,
  TableWrap,
  Td,
  Th,
} from '@/components/ui/primitives';
import { getEntitlements, PRICING_TIERS, TIER_ORDER } from '@/lib/auth/entitlements';
import { getSession, TIER_LABELS } from '@/lib/auth/session';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const session = await getSession();
  const entitlements = await getEntitlements(session);
  const currentIndex = TIER_ORDER.indexOf(session.tier);

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Plans"
        title="Access tiers"
        description="Every gate on this site is read from the feature_flags table and evaluated on the server. Switching persona in the header changes the session tier, which changes what actually gets queried — not what gets hidden."
        action={
          <div className="text-right">
            <Badge tone="accent">Current: {TIER_LABELS[session.tier]}</Badge>
            <p className="mt-1 text-[11px] text-ink-subtle">
              {entitlements.filter((e) => e.granted).length} of {entitlements.length} features
              unlocked
            </p>
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-3">
        {PRICING_TIERS.map((tier) => {
          const index = TIER_ORDER.indexOf(tier.tier);
          const isCurrent = tier.tier === session.tier;
          const isIncluded = index <= currentIndex;

          return (
            <Card
              key={tier.tier}
              sheen={isCurrent}
              className={cn('flex flex-col', isCurrent && 'border-accent/40')}
            >
              <CardHeader>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle as="h2">{tier.name}</CardTitle>
                    {isCurrent ? <Badge tone="accent">Your plan</Badge> : null}
                    {!isCurrent && isIncluded ? <Badge tone="outline">Included</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-ink-subtle">{tier.tagline}</p>
                </div>
                <div className="text-right">
                  <p className="tnum text-xl font-semibold text-ink">
                    {tier.priceMonthly === 0 ? 'Free' : `$${tier.priceMonthly}`}
                  </p>
                  {tier.priceMonthly > 0 ? (
                    <p className="text-[10px] text-ink-subtle">per month</p>
                  ) : null}
                </div>
              </CardHeader>

              <CardBody className="flex-1">
                <ul className="flex flex-col gap-2.5">
                  {tier.highlights.map((item) => (
                    <li key={item} className="flex gap-2 text-[13px] text-ink-muted">
                      <span
                        aria-hidden
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          isIncluded ? 'bg-accent' : 'bg-line-strong',
                        )}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardBody>

              <CardFooter className="flex items-center justify-between">
                <span className="text-[11px] text-ink-subtle">
                  {tier.tier === 'free'
                    ? 'No card required'
                    : isCurrent
                      ? 'Active on this session'
                      : isIncluded
                        ? 'Already included'
                        : 'Upgrade from the header'}
                </span>
                {!isCurrent && !isIncluded ? (
                  <span className="text-[11px] text-accent">Change persona to test →</span>
                ) : null}
              </CardFooter>
            </Card>
          );
        })}
      </section>

      {/* ------------------------------ entitlements ---------------------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Feature matrix</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              Read live from the database and evaluated against{' '}
              <code className="text-ink">session.tier</code>. The “granted” column is what the
              server actually decided for the persona you are signed in as.
            </p>
          </div>
        </CardHeader>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Feature</Th>
                <Th>Flag</Th>
                <Th align="right">Minimum tier</Th>
                <Th align="right">Enabled</Th>
                <Th align="right">Granted to you</Th>
              </tr>
            </thead>
            <tbody>
              {entitlements.map((entitlement) => (
                <tr key={entitlement.key}>
                  <Td className="text-[13px] text-ink">{entitlement.label}</Td>
                  <Td className="font-mono text-[11px] text-ink-subtle">{entitlement.key}</Td>
                  <Td align="right">
                    <Badge
                      tone={
                        entitlement.minTier === 'free'
                          ? 'neutral'
                          : entitlement.minTier === 'pro'
                            ? 'accent'
                            : 'info'
                      }
                    >
                      {TIER_LABELS[entitlement.minTier]}
                    </Badge>
                  </Td>
                  <Td align="right" className="text-xs text-ink-subtle">
                    {entitlement.enabled ? 'yes' : 'no'}
                  </Td>
                  <Td align="right">
                    <span
                      className={cn(
                        'text-xs font-medium',
                        entitlement.granted ? 'text-up' : 'text-down',
                      )}
                    >
                      {entitlement.granted ? '✓ granted' : '✕ locked'}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      {/* -------------------------------- gating -------------------------------- */}
      <Callout tone="accent" title="How the gate is actually enforced">
        On <Link href="/trends" className="text-accent underline">/trends</Link>, a session below the
        Pro tier returns the locked panel <em>before</em> the trend queries are issued. The gated data
        never reaches the client, so this is a real server-side entitlement check rather than CSS
        over content the browser was already sent. The same pattern applies to the analyst desk and
        the content studio.
      </Callout>

      <Callout tone="neutral" title="Billing is stubbed, deliberately">
        The <code className="text-ink">subscriptions</code> table is already shaped like a Stripe
        subscription — customer id, subscription id, current period end, status — and the tier model
        is in place. What is missing is the Stripe integration itself, which needs real account
        credentials and webhook endpoints. The architecture is ready for it; pretending to have
        wired it up would not be.
      </Callout>
    </div>
  );
}
