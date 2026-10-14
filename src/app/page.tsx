/**
 * Market overview — the front page.
 *
 * Structure follows the question an analyst actually asks, in order:
 *   1. Where is the market? (index, change, liquidity)
 *   2. What is moving inside it? (categories, breadth)
 *   3. What specifically moved? (gainers, fallers)
 *   4. What is rotating underneath? (colour and material share)
 *   5. What do we think it means? (analyst notes, reports)
 */
import Link from 'next/link';

import { ArticleCard, InsightCard, PageHeader, TrendChip } from '@/components/cards';
import { IndexChart, RankBars } from '@/components/charts/charts';
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Delta,
  Stat,
} from '@/components/ui/primitives';
import { getSparklineSeries } from '@/lib/data/catalog';
import { listArticles, listInsights, type InsightRecord } from '@/lib/data/editorial';
import {
  getCategorySummaries,
  getMarketIndexSeries,
  getMarketOverview,
  getMovers,
  type Mover,
} from '@/lib/data/market';
import { getMarketMomentum, getRotationSummary } from '@/lib/data/trends';
import { formatDate, formatMoney, formatNumber, formatPercent, titleCase } from '@/lib/format';
import { COLOR_HEX } from '@/lib/palette';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const [
    overview,
    indexSeries,
    categories,
    gainers,
    fallers,
    momentum,
    rotation,
    insights,
    articles,
  ] = await Promise.all([
    getMarketOverview(),
    getMarketIndexSeries(),
    getCategorySummaries(),
    getMovers({ limit: 6, direction: 'up' }),
    getMovers({ limit: 6, direction: 'down' }),
    getMarketMomentum(),
    getRotationSummary(),
    listInsights({ limit: 3 }),
    listArticles(),
  ]);

  const moverIds = [...gainers, ...fallers].map((m) => m.productId);
  const sparks = await getSparklineSeries(moverIds, 14);

  const breadth = momentum.total || 1;
  const topColors = rotation.colors.slice(0, 5);
  const bottomColors = rotation.colors.slice(-3).reverse();
  const topMaterials = rotation.materials.slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      {/* ------------------------------- hero ------------------------------- */}
      <section className="relative overflow-hidden rounded-card border border-line bg-surface">
        <div className="pointer-events-none absolute inset-0 grid-backdrop" aria-hidden />
        <div className="relative px-6 py-7">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Badge tone="accent">Live index</Badge>
            <span className="text-xs text-ink-subtle">
              {formatDate(overview.firstWeek)} – {formatDate(overview.asOf)} ·{' '}
              {formatNumber(overview.observations)} price observations
            </span>
          </div>

          <PageHeader
            title="The premium is narrowing, not disappearing"
            description="A volume-weighted read on the sneaker resale market. The index has fallen from 1.44× retail to 1.16× in eighteen months and half the catalogue now trades below retail — but the top decile still clears 2×. That is compression in the middle of the distribution, not a collapse, and the difference matters for what you buy. Explore the catalogue, the rotation underneath it, and the analyst notes that explain both."
          />

          <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            <Stat
              label="Resale index"
              value={`${overview.indexNow.toFixed(3)}×`}
              delta={overview.change4w}
              tone="accent"
            />
            <Stat
              label="12-month change"
              value={<Delta value={overview.change52w} />}
              sub="vs 1 year ago"
            />
            <Stat
              label="Units traded"
              value={formatNumber(overview.volume4w)}
              delta={overview.volumeChange}
              sub="last 4 weeks"
            />
            <Stat
              label="Standing supply"
              value={formatNumber(overview.activeListings)}
              sub="active listings"
            />
            <Stat
              label="Heating"
              value={`${Math.round((momentum.heating / breadth) * 100)}%`}
              sub={`${momentum.heating} of ${momentum.total} silhouettes`}
            />
            <Stat
              label="Tracked"
              value={formatNumber(overview.trackedProducts)}
              sub={`${overview.trackedBrands} brands · ${overview.trackedCategories} categories`}
            />
          </div>
        </div>
      </section>

      {/* ------------------------------ index ------------------------------ */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Resale index vs retail</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              Volume-weighted resale multiple across the catalogue. 1.00× means the market is
              trading at retail.
            </p>
          </div>
          <Link href="/trends" className="shrink-0 text-xs text-accent hover:underline">
            Trend radar →
          </Link>
        </CardHeader>
        <CardBody className="pt-2">
          <IndexChart data={indexSeries} height={240} />
        </CardBody>
      </Card>

      {/* ---------------------------- categories ---------------------------- */}
      <section className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Category momentum</CardTitle>
              <p className="mt-0.5 text-xs text-ink-subtle">
                Trend Momentum Index, 90-day window. 50 is neutral; above 60 is heating.
              </p>
            </div>
          </CardHeader>
          <CardBody className="pt-3">
            <RankBars
              height={200}
              items={categories
                .filter((c) => c.tmiScore !== null)
                .map((c) => ({ label: c.name, value: c.tmiScore ?? 0 }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Category detail</CardTitle>
          </CardHeader>
          <div className="divide-y divide-line">
            <div className="grid grid-cols-[1.4fr_repeat(3,1fr)] gap-2 px-5 py-2 text-[11px] tracking-wider text-ink-subtle uppercase">
              <span>Category</span>
              <span className="text-right">Multiple</span>
              <span className="text-right">30d</span>
              <span className="text-right">Momentum</span>
            </div>
            {categories.map((c) => (
              <Link
                key={c.categoryId}
                href={`/products?category=${c.categoryId}`}
                className="grid grid-cols-[1.4fr_repeat(3,1fr)] items-center gap-2 px-5 py-2.5 transition-colors hover:bg-raised/50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-ink">{c.name}</span>
                  <span className="block text-[10px] text-ink-subtle">
                    {formatNumber(c.productCount)} silhouettes
                  </span>
                </span>
                <span className="tnum text-right text-[13px] text-ink">{c.index.toFixed(2)}×</span>
                <span
                  className={`tnum text-right text-xs ${
                    c.change4w > 0 ? 'text-up' : c.change4w < 0 ? 'text-down' : 'text-ink-subtle'
                  }`}
                >
                  {formatPercent(c.change4w)}
                </span>
                <span className="text-right">
                  <TrendChip score={c.tmiScore} />
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </section>

      {/* ------------------------------ movers ------------------------------ */}
      <section className="grid gap-4 lg:grid-cols-2">
        <MoverList
          title="Heating up"
          subtitle="Largest 30-day gains, minimum 12 units traded"
          movers={gainers}
          sparks={sparks}
        />
        <MoverList
          title="Cooling off"
          subtitle="Largest 30-day declines, minimum 12 units traded"
          movers={fallers}
          sparks={sparks}
        />
      </section>

      {/* ------------------------------ rotation ---------------------------- */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle as="h2">Rotation: colour and material share</CardTitle>
              <p className="mt-0.5 text-xs text-ink-subtle">
                Share of transaction value, first month vs last. Materials overlap — a product can
                carry several, so material shares do not sum to 100%.
              </p>
            </div>
            <Link href="/trends" className="shrink-0 text-xs text-accent hover:underline">
              Full series →
            </Link>
          </CardHeader>
          <CardBody className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <RotationList title="Colourways gaining" items={topColors} colours />
            <RotationList title="Colourways losing" items={bottomColors} colours />
            <div className="sm:col-span-2">
              <p className="mb-2 label-caps">Materials</p>
              <div className="flex flex-col gap-1.5">
                {topMaterials.map((m) => (
                  <RotationRow key={m.value} label={titleCase(m.value)} delta={m.delta} share={m.lastShare} />
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Market breadth</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <BreadthBar
              heating={momentum.heating}
              stable={momentum.stable}
              cooling={momentum.cooling}
              total={momentum.total}
            />
            <Callout title="How to read breadth">
              A market where most silhouettes sit between 40 and 60 is a market without a
              narrative. Today {formatNumber(momentum.stable)} of {formatNumber(momentum.total)} sit
              there, with {formatNumber(momentum.heating)} genuinely heating — the same
              middle-is-quiet pattern the index shows.
            </Callout>
            <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
              <Stat label="Analyst notes" value={formatNumber(overview.publishedInsights)} />
              <Stat label="Published reports" value={formatNumber(overview.publishedArticles)} />
            </div>
          </CardBody>
        </Card>
      </section>

      {/* ------------------------------ insight ----------------------------- */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Latest from the analyst desk</h2>
            <p className="mt-1 text-sm text-ink-subtle">
              Manual observations linked to catalogue records. One note surfaces on every linked
              product, colourway and category page.
            </p>
          </div>
          <Link href="/admin" className="text-xs text-accent hover:underline">
            Open analyst desk →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {insights.map((insight) => (
            <InsightCardLazy key={insight.id} insight={insight} />
          ))}
        </div>
      </section>

      {/* ------------------------------ editorial --------------------------- */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Reports</h2>
            <p className="mt-1 text-sm text-ink-subtle">
              Long-form market analyses from the editorial desk.
            </p>
          </div>
          <Link href="/editorial" className="text-xs text-accent hover:underline">
            All reports →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {articles.slice(0, 3).map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Local compositions                                                          */
/* -------------------------------------------------------------------------- */

function InsightCardLazy({ insight }: { insight: InsightRecord }) {
  return <InsightCard insight={insight} dense />;
}

function MoverList({
  title,
  subtitle,
  movers,
  sparks,
}: {
  title: string;
  subtitle: string;
  movers: Mover[];
  sparks: Map<string, number[]>;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h2">{title}</CardTitle>
          <p className="mt-0.5 text-xs text-ink-subtle">{subtitle}</p>
        </div>
      </CardHeader>
      <div className="p-2">
        {movers.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-ink-subtle">No qualifying moves.</p>
        ) : (
          movers.map((mover) => (
            <Link
              key={mover.productId}
              href={`/products/${mover.slug}`}
              className="flex items-center gap-3 rounded-control px-2.5 py-2 transition-colors hover:bg-raised/60"
            >
              <span
                aria-hidden
                className="h-6 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: COLOR_HEX[mover.primaryColor] ?? COLOR_HEX.unknown }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{mover.name}</span>
                <span className="block truncate text-[11px] text-ink-subtle">
                  {mover.colorway} · {formatNumber(mover.volume4w)} sold
                </span>
              </span>
              <span className="tnum w-14 shrink-0 text-right text-[13px] text-ink">
                {formatMoney(mover.latestCents)}
              </span>
              <span
                className={`tnum w-14 shrink-0 text-right text-xs font-medium ${
                  mover.change >= 0 ? 'text-up' : 'text-down'
                }`}
              >
                {formatPercent(mover.change)}
              </span>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}

function RotationList({
  title,
  items,
  colours,
}: {
  title: string;
  items: { value: string; delta: number; lastShare: number }[];
  colours?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 label-caps">{title}</p>
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <RotationRow
            key={item.value}
            label={titleCase(item.value)}
            delta={item.delta}
            share={item.lastShare}
            hex={colours ? (COLOR_HEX[item.value] ?? COLOR_HEX.unknown) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function RotationRow({
  label,
  delta,
  share,
  hex,
}: {
  label: string;
  delta: number;
  share: number;
  hex?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {hex ? (
        <span
          aria-hidden
          className="h-3 w-3 shrink-0 rounded-[3px] border border-line-strong"
          style={{ backgroundColor: hex }}
        />
      ) : null}
      <span className="w-20 shrink-0 truncate text-[13px] text-ink">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
        <span
          className={`block h-full rounded-full ${delta >= 0 ? 'bg-up' : 'bg-down'}`}
          style={{ width: `${Math.min(100, Math.abs(delta) * 900)}%` }}
        />
      </span>
      <span className={`tnum w-16 shrink-0 text-right text-xs ${delta >= 0 ? 'text-up' : 'text-down'}`}>
        {delta >= 0 ? '+' : '−'}
        {(Math.abs(delta) * 100).toFixed(1)}pp
      </span>
      <span className="tnum w-12 shrink-0 text-right text-[11px] text-ink-subtle">
        {(share * 100).toFixed(1)}%
      </span>
    </div>
  );
}

function BreadthBar({
  heating,
  stable,
  cooling,
  total,
}: {
  heating: number;
  stable: number;
  cooling: number;
  total: number;
}) {
  const pct = (n: number) => `${total === 0 ? 0 : (n / total) * 100}%`;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full">
        <span className="bg-up" style={{ width: pct(heating) }} />
        <span className="bg-accent/70" style={{ width: pct(stable) }} />
        <span className="bg-down" style={{ width: pct(cooling) }} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-subtle">
        <span className="text-up">{heating} heating</span>
        <span>{stable} stable</span>
        <span className="text-down">{cooling} cooling</span>
      </div>
    </div>
  );
}
