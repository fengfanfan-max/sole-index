/**
 * Trend radar.
 *
 * Gated behind the `trends.momentum` and `trends.attribute` feature flags. The
 * gate is enforced here, on the server: a free session never causes the trend
 * queries to run, so the locked state is an absence of data rather than a blur
 * over data the browser already received.
 */
import Link from 'next/link';

import { InsightCard, LockedPanel, PageHeader } from '@/components/cards';
import { RankBars, ShareTrendChart } from '@/components/charts/charts';
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ScoreMeter,
  Stat,
  Swatch,
  Table,
  TableWrap,
  Td,
  Th,
} from '@/components/ui/primitives';
import { getSession, hasTier } from '@/lib/auth/session';
import { getInsightsForEntity } from '@/lib/data/editorial';
import {
  getAttributeTrend,
  getMarketMomentum,
  getRotationSummary,
  getScoredEntities,
  type TrendAttribute,
} from '@/lib/data/trends';
import { formatNumber, formatPercent, formatPoints, titleCase } from '@/lib/format';
import { COLOR_HEX } from '@/lib/palette';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const ATTRIBUTES: { key: TrendAttribute; label: string; blurb: string }[] = [
  {
    key: 'color',
    label: 'Colourways',
    blurb: 'Share of transaction value by primary colourway. Olive and earth tones are absorbing share from black and white.',
  },
  {
    key: 'material',
    label: 'Materials',
    blurb:
      'Share of transaction value held by products containing each material. Materials overlap — a product can carry several — so these shares do not sum to 100%.',
  },
  {
    key: 'category',
    label: 'Categories',
    blurb: 'Share of transaction value by product category.',
  },
];

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ attribute?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;

  if (!hasTier(session, 'pro')) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Intelligence"
          title="Trend radar"
          description="Momentum rankings and share-of-value rotation across colourways, materials and categories."
        />
        <LockedPanel
          featureKey="trends.momentum"
          requiredTier="Pro"
          currentTier={session.tier}
          title="Trend intelligence is a Pro feature"
          description="The Trend Momentum Index, the colourway and material share series, and the rotation tables are all behind the Pro tier. Switch persona in the header to a Pro or Enterprise account to see them, or read the methodology — that part is public."
        />
      </div>
    );
  }

  const attribute = (ATTRIBUTES.find((a) => a.key === params.attribute)?.key ??
    'color') as TrendAttribute;
  const activeSpec = ATTRIBUTES.find((a) => a.key === attribute)!;

  const [attributeTrend, momentum, rotation, colorScores, materialScores, categoryScores, topProducts] =
    await Promise.all([
      getAttributeTrend(attribute),
      getMarketMomentum(),
      getRotationSummary(),
      getScoredEntities('color'),
      getScoredEntities('material'),
      getScoredEntities('category'),
      getScoredEntities('product', { limit: 12 }),
    ]);

  // Insights attached to the leading colourway on the active attribute, which is
  // the clearest demonstration that analyst notes and trend data are joined up.
  const leadValue = attributeTrend.summaries[0]?.value;
  const leadInsights = leadValue
    ? await getInsightsForEntity(
        attribute === 'color' ? 'color' : attribute === 'material' ? 'material' : 'category',
        leadValue,
      )
    : [];

  const breadth = momentum.total || 1;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Intelligence"
        title="Trend radar"
        description="Two different measurements, deliberately kept apart: share of transaction value answers “how big is this”, while the momentum score answers “is it accelerating”. A colourway can hold a large share and still be losing momentum."
        action={
          <Link
            href="/trends/methodology"
            className="text-xs text-accent hover:underline"
          >
            How the score is built →
          </Link>
        }
      />

      {/* ------------------------------- breadth ------------------------------- */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <Stat
            label="Heating"
            value={formatNumber(momentum.heating)}
            sub={`${Math.round((momentum.heating / breadth) * 100)}% of the catalogue`}
          />
        </Card>
        <Card className="p-4">
          <Stat label="Stable" value={formatNumber(momentum.stable)} sub="40–60 on the index" />
        </Card>
        <Card className="p-4">
          <Stat label="Cooling" value={formatNumber(momentum.cooling)} sub="below 40" />
        </Card>
        <Card className="p-4">
          <Stat
            label="Median score"
            value={momentum.median.toFixed(1)}
            sub={`across ${formatNumber(momentum.total)} silhouettes`}
          />
        </Card>
      </section>

      {/* ---------------------------- segment scores --------------------------- */}
      <section className="grid gap-4 lg:grid-cols-3">
        <SegmentCard title="Colourway momentum" entities={colorScores} showSwatch />
        <SegmentCard title="Material momentum" entities={materialScores} />
        <SegmentCard title="Category momentum" entities={categoryScores} />
      </section>

      {/* ------------------------------ rotation ------------------------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Rotation: what is gaining and losing share</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              Change in share of transaction value between the first and last month of the window.
            </p>
          </div>
        </CardHeader>
        <CardBody className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          <RotationTable title="Colourways" rows={rotation.colors} showSwatch />
          <RotationTable title="Materials" rows={rotation.materials} />
        </CardBody>
      </Card>

      {/* ------------------------------- series -------------------------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Share of transaction value over time</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">{activeSpec.blurb}</p>
          </div>
          <div className="flex shrink-0 gap-1 rounded-control border border-line p-0.5">
            {ATTRIBUTES.map((a) => (
              <Link
                key={a.key}
                href={`/trends?attribute=${a.key}`}
                className={cn(
                  'rounded-[6px] px-2.5 py-1 text-[11px] transition-colors',
                  a.key === attribute
                    ? 'bg-raised font-medium text-ink'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {a.label}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardBody className="pt-2">
          <ShareTrendChart
            series={attributeTrend.series}
            months={attributeTrend.months}
            height={330}
            limit={6}
          />
        </CardBody>
        <CardFooterish
          text={`Top six by current share. ${attributeTrend.months.length} monthly buckets from ${attributeTrend.months[0]} to ${attributeTrend.months[attributeTrend.months.length - 1]}.`}
        />
      </Card>

      {/* ---------------------------- leaderboard ------------------------------ */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Momentum leaderboard</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              Highest-scoring silhouettes on the 90-day window. Thin samples are still scored, but
              flagged — a 22-minute-old product with one print should not outrank a real trend.
            </p>
          </div>
        </CardHeader>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th className="w-8">#</Th>
                <Th>Product</Th>
                <Th className="hidden lg:table-cell">Colourway</Th>
                <Th align="right">Units (4w)</Th>
                <Th align="right">Momentum</Th>
                <Th align="right" className="hidden md:table-cell">Read</Th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((row, index) => (
                <tr key={row.entityId} className="transition-colors hover:bg-raised/40">
                  <Td className="tnum text-xs text-ink-subtle">{index + 1}</Td>
                  <Td>
                    <Link
                      href={`/products/${row.entityId}`}
                      className="text-[13px] text-ink hover:text-accent"
                    >
                      {row.label}
                    </Link>
                  </Td>
                  <Td className="hidden text-xs text-ink-subtle lg:table-cell">{row.sublabel}</Td>
                  <Td align="right" className="tnum text-xs text-ink-muted">
                    —
                  </Td>
                  <Td align="right">
                    <span className="inline-flex w-28 justify-end">
                      <ScoreMeter score={row.score} />
                    </span>
                  </Td>
                  <Td align="right" className="hidden md:table-cell">
                    <Badge tone={row.score >= 60 ? 'up' : row.score >= 40 ? 'accent' : 'down'}>
                      {row.score >= 60 ? 'heating' : row.score >= 40 ? 'stable' : 'cooling'}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      {/* ------------------------------ insights ------------------------------- */}
      {leadInsights.length > 0 ? (
        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Analyst notes on {titleCase(leadValue ?? '')}
            </h2>
            <p className="mt-1 text-sm text-ink-subtle">
              The same notes also appear on the individual product pages they are linked to.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {leadInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} dense />
            ))}
          </div>
        </section>
      ) : null}

      <Callout tone="neutral" title="Statistical honesty">
        Momentum scores are computed from at most 78 weekly observations per entity and every factor
        is normalised against a calibration set that will drift as the market changes. The index is
        re-tuned deliberately, not continuously — see the{' '}
        <Link href="/trends/methodology" className="text-accent hover:underline">
          methodology
        </Link>{' '}
        for the current constants and the known failure modes.
      </Callout>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Local compositions                                                          */
/* -------------------------------------------------------------------------- */

function CardFooterish({ text }: { text: string }) {
  return (
    <div className="border-t border-line px-5 py-3 text-[11px] text-ink-subtle">{text}</div>
  );
}

function SegmentCard({
  title,
  entities,
  showSwatch,
}: {
  title: string;
  entities: { entityId: string; label: string; score: number }[];
  showSwatch?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
      </CardHeader>
      <CardBody className="pt-3">
        <RankBars
          height={200}
          items={entities.slice(0, 7).map((e) => ({
            label: titleCase(e.label),
            value: e.score,
            colour: showSwatch ? (COLOR_HEX[e.entityId] ?? COLOR_HEX.unknown) : undefined,
          }))}
        />
      </CardBody>
    </Card>
  );
}

function RotationTable({
  title,
  rows,
  showSwatch,
}: {
  title: string;
  rows: { value: string; delta: number; lastShare: number }[];
  showSwatch?: boolean;
}) {
  const gaining = rows.filter((r) => r.delta > 0).slice(0, 5);
  const losing = rows.filter((r) => r.delta < 0).slice(-4).reverse();

  return (
    <div>
      <p className="mb-3 label-caps">{title}</p>
      <div className="flex flex-col gap-3">
        {[...gaining.map((r) => ({ ...r, dir: 1 })), ...losing.map((r) => ({ ...r, dir: -1 }))].map(
          (row) => (
            <div key={row.value} className="flex items-center gap-2.5">
              {showSwatch ? (
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-[3px] border border-line-strong"
                  style={{ backgroundColor: COLOR_HEX[row.value] ?? COLOR_HEX.unknown }}
                />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    'h-3 w-3 shrink-0 rounded-full border',
                    row.dir > 0 ? 'border-up/50 bg-up/25' : 'border-down/50 bg-down/25',
                  )}
                />
              )}
              <span className="w-20 shrink-0 truncate text-[13px] text-ink">
                {titleCase(row.value)}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                <span
                  className={cn('block h-full rounded-full', row.dir > 0 ? 'bg-up' : 'bg-down')}
                  style={{ width: `${Math.min(100, Math.abs(row.delta) * 800)}%` }}
                />
              </span>
              <span
                className={cn(
                  'tnum w-16 shrink-0 text-right text-xs',
                  row.dir > 0 ? 'text-up' : 'text-down',
                )}
              >
                {formatPoints(row.delta)}
              </span>
              <span className="tnum w-12 shrink-0 text-right text-[11px] text-ink-subtle">
                {(row.lastShare * 100).toFixed(1)}%
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
