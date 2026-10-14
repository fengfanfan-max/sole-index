/**
 * Product detail.
 *
 * This page is where the brief's "manually collected observations linked to
 * existing database records" requirement becomes visible: the analyst notes in
 * the right-hand column were authored once on the analyst desk and attached to
 * this product's style code. The same notes also appear on the colourway and
 * category trend pages.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { InsightCard, PageHeader } from '@/components/cards';
import { PriceHistoryChart, SupplyDemandChart, TmiRadar } from '@/components/charts/charts';
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  ScoreMeter,
  Stat,
  Swatch,
} from '@/components/ui/primitives';
import {
  TMI_FACTOR_DESCRIPTIONS,
  TMI_FACTOR_LABELS,
  TMI_FACTORS,
  TMI_WEIGHTS,
} from '@/lib/analytics/tmi';
import {
  getPlatformComparison,
  getPriceSeries,
  getProductByIdOrSlug,
  getSalesSeries,
  getSimilarProducts,
} from '@/lib/data/catalog';
import { getInsightsForEntity } from '@/lib/data/editorial';
import { getTmiBreakdown } from '@/lib/data/trends';
import { formatDate, formatMoney, formatMultiple, formatNumber, formatPercent, titleCase } from '@/lib/format';
import { COLOR_HEX } from '@/lib/palette';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductByIdOrSlug(slug);
  if (!product) notFound();

  const [priceSeries, salesSeries, tmi, insights, platforms, similar] = await Promise.all([
    getPriceSeries(product.id),
    getSalesSeries(product.id),
    getTmiBreakdown('product', product.id),
    getInsightsForEntity('product', product.id),
    getPlatformComparison(product.id),
    getSimilarProducts(product.id, product.silhouette, 4),
  ]);

  const hex = COLOR_HEX[product.primaryColor] ?? COLOR_HEX.unknown;
  const latestListings = salesSeries[salesSeries.length - 1]?.activeListings ?? 0;
  const totalVolume = salesSeries.reduce((sum, p) => sum + p.volume, 0);
  const turnover = latestListings > 0 ? totalVolume / Math.max(1, latestListings) : 0;

  // Cross-platform spread, taken from the most recent week where more than one
  // platform reported. A single-platform product simply has no spread to show.
  const lastDate = platforms[platforms.length - 1]?.date;
  const lastWeek = platforms.filter((p) => p.date === lastDate);
  const spread =
    lastWeek.length > 1
      ? (Math.max(...lastWeek.map((p) => p.lastSaleCents)) -
          Math.min(...lastWeek.map((p) => p.lastSaleCents))) /
        Math.max(
          1,
          lastWeek.reduce((sum, p) => sum + p.lastSaleCents, 0) / lastWeek.length,
        )
      : null;

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap items-center gap-2 text-[11px] text-ink-subtle">
        <Link href="/products" className="hover:text-ink">
          Catalogue
        </Link>
        <span>/</span>
        <Link href={`/products?brand=${product.brandId}`} className="hover:text-ink">
          {product.brandName}
        </Link>
        <span>/</span>
        <Link href={`/products?category=${product.categoryId}`} className="hover:text-ink">
          {product.categoryName}
        </Link>
      </nav>

      <PageHeader
        eyebrow={`${product.brandName} · ${product.silhouette} · ${product.id}`}
        title={product.name}
        description={product.description ?? undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="outline">{product.categoryName}</Badge>
            <Badge tone="neutral">Released {formatDate(product.releaseDate)}</Badge>
            <Badge tone="neutral">Retail {formatMoney(product.retailPriceCents)}</Badge>
          </div>
        }
      />

      {/* -------------------------------- KPI -------------------------------- */}
      <Card sheen className="p-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Resale price"
            value={product.latestCents !== null ? formatMoney(product.latestCents) : '—'}
            delta={product.change ?? undefined}
            tone="accent"
          />
          <Stat
            label="Multiple of retail"
            value={product.multiple !== null ? formatMultiple(product.multiple) : '—'}
            sub={
              product.multiple === null
                ? undefined
                : product.multiple >= 1
                  ? `+${formatMoney((product.latestCents ?? 0) - product.retailPriceCents)} over retail`
                  : `${formatMoney(product.retailPriceCents - (product.latestCents ?? 0))} under retail`
            }
          />
          <Stat label="Units (4w)" value={formatNumber(product.volume4w)} sub="transactions" />
          <Stat label="Standing supply" value={formatNumber(latestListings)} sub="active listings" />
          <Stat
            label="Turnover"
            value={turnover > 0 ? `${turnover.toFixed(2)}×` : '—'}
            sub="units per standing listing"
          />
          <div className="flex flex-col gap-1.5">
            <span className="label-caps">Trend momentum</span>
            <span className="tnum text-2xl leading-none font-semibold text-ink">
              {tmi ? tmi.score.toFixed(0) : '—'}
            </span>
            <span className="flex items-center gap-2">
              {tmi ? <ScoreMeter score={tmi.score} showValue={false} className="w-20" /> : null}
              {tmi ? (
                <span className="text-[11px] text-ink-subtle">
                  {tmi.score >= 60 ? 'heating' : tmi.score >= 40 ? 'stable' : 'cooling'}
                </span>
              ) : null}
            </span>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* --------------------------- price history -------------------------- */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Price history</CardTitle>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  Bid, ask and last sale over {priceSeries.length} weekly observations. Weekly
                  aggregates in the demo dataset; the schema is daily-capable.
                </p>
              </div>
            </CardHeader>
            <CardBody className="pt-2">
              <PriceHistoryChart data={priceSeries} retailCents={product.retailPriceCents} height={320} />
            </CardBody>
            <CardFooter className="flex flex-wrap gap-4">
              <span>
                Window low{' '}
                <span className="tnum text-ink-muted">
                  {formatMoney(Math.min(...priceSeries.map((p) => p.lastSaleCents ?? Infinity)))}
                </span>
              </span>
              <span>
                Window high{' '}
                <span className="tnum text-ink-muted">
                  {formatMoney(Math.max(...priceSeries.map((p) => p.lastSaleCents ?? 0)))}
                </span>
              </span>
              <span>
                {formatNumber(totalVolume)} units traded across the window
              </span>
            </CardFooter>
          </Card>

          {/* --------------------------- supply demand -------------------------- */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Supply and demand</CardTitle>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  Units sold against standing listings. When listings grow faster than volume, the
                  spread widens and price follows.
                </p>
              </div>
            </CardHeader>
            <CardBody className="pt-2">
              <SupplyDemandChart data={salesSeries} height={210} />
            </CardBody>
          </Card>

          {/* ---------------------------- platforms ----------------------------- */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Cross-platform</CardTitle>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  The same style code across marketplaces the provider aggregates.
                </p>
              </div>
              {spread !== null ? (
                <Badge tone={spread > 0.04 ? 'warn' : 'neutral'}>
                  {(spread * 100).toFixed(1)}% spread
                </Badge>
              ) : null}
            </CardHeader>
            <div className="divide-y divide-line">
              {lastWeek.map((row) => (
                <div key={row.platformId} className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-[13px] text-ink">{row.platformName}</span>
                  <span className="tnum text-[13px] text-ink">{formatMoney(row.lastSaleCents)}</span>
                </div>
              ))}
              {lastWeek.length === 0 ? (
                <p className="px-5 py-4 text-xs text-ink-subtle">
                  No cross-platform observations in the window.
                </p>
              ) : null}
            </div>
            <CardFooter>
              Spread is computed on the most recent week where more than one marketplace reported.
              Thin platforms are sampled monthly in the demo dataset.
            </CardFooter>
          </Card>
        </div>

        {/* ------------------------------ sidebar ----------------------------- */}
        <div className="flex flex-col gap-6">
          {/* ------------------------------ TMI ------------------------------- */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Momentum breakdown</CardTitle>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {tmi ? `${tmi.windowDays}-day window · computed ${formatDate(tmi.computedAt)}` : 'Not computed'}
                </p>
              </div>
              <Link href="/trends/methodology" className="text-[11px] text-accent hover:underline">
                Method
              </Link>
            </CardHeader>
            {tmi ? (
              <>
                <CardBody className="pb-0">
                  <TmiRadar components={tmi.components} labels={TMI_FACTOR_LABELS} height={190} />
                </CardBody>
                <CardBody className="pt-3">
                  <div className="flex flex-col gap-2.5">
                    {TMI_FACTORS.map((factor) => (
                      <div key={factor} className="flex items-center gap-2.5">
                        <span className="w-24 shrink-0 text-[11px] text-ink-muted">
                          {TMI_FACTOR_LABELS[factor]}
                        </span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${tmi.components[factor] * 100}%` }}
                          />
                        </span>
                        <span className="tnum w-14 shrink-0 text-right text-[11px] text-ink-subtle">
                          {(TMI_WEIGHTS[factor] * 100).toFixed(0)}% × {(tmi.components[factor] * 100).toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardBody>
                <CardFooter>
                  Each factor is normalised to 0–100, then combined at the published weights. A
                  high score describes the current state; it is not a forecast.
                </CardFooter>
              </>
            ) : (
              <CardBody>
                <p className="text-xs text-ink-subtle">
                  No score has been computed for this product yet. Run{' '}
                  <code className="text-ink-muted">pnpm analytics:refresh</code>.
                </p>
              </CardBody>
            )}
          </Card>

          {/* --------------------------- attributes ---------------------------- */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Attributes</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-3 text-xs">
              <Row label="Primary colour">
                <Swatch hex={hex} label={titleCase(product.primaryColor)} />
              </Row>
              {product.secondaryColor ? (
                <Row label="Secondary">
                  <Swatch
                    hex={COLOR_HEX[product.secondaryColor] ?? COLOR_HEX.unknown}
                    label={titleCase(product.secondaryColor)}
                  />
                </Row>
              ) : null}
              <Row label="Materials">
                <span className="flex flex-wrap gap-1">
                  {product.materials.map((m) => (
                    <Link
                      key={m}
                      href={`/trends?attribute=material&value=${m}`}
                      className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-muted hover:border-line-strong hover:text-ink"
                    >
                      {titleCase(m)}
                    </Link>
                  ))}
                </span>
              </Row>
              <Row label="Category">
                <Link
                  href={`/trends?attribute=category&value=${product.categoryId}`}
                  className="text-accent hover:underline"
                >
                  {product.categoryName}
                </Link>
              </Row>
              <Row label="Silhouette">{product.silhouette}</Row>
              <Row label="Release">{formatDate(product.releaseDate, 'long')}</Row>
              <Row label="Currency">{product.currency}</Row>
            </CardBody>
          </Card>

          {/* ---------------------------- insights ----------------------------- */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Analyst notes</CardTitle>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  Manually linked to this style code — and to the colourway and category pages.
                </p>
              </div>
              <Badge tone={insights.length > 0 ? 'accent' : 'neutral'}>{insights.length}</Badge>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              {insights.length === 0 ? (
                <p className="text-xs text-ink-subtle">
                  No manual observations attached yet. Author one from the{' '}
                  <Link href="/admin" className="text-accent hover:underline">
                    analyst desk
                  </Link>
                  .
                </p>
              ) : (
                insights.map((insight) => <InsightCard key={insight.id} insight={insight} dense />)
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ------------------------------- similar ------------------------------ */}
      {similar.length > 0 ? (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Other {product.silhouette} colourways
              </h2>
              <p className="mt-1 text-sm text-ink-subtle">
                Closest by price, which is usually the comparison a buyer is actually making.
              </p>
            </div>
            <Link
              href={`/compare?ids=${[product.id, ...similar.slice(0, 3).map((s) => s.id)].join(',')}`}
              className="text-xs text-accent hover:underline"
            >
              Compare these →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map((item) => (
              <Link key={item.id} href={`/products/${item.slug}`}>
                <Card interactive className="p-4">
                  <p className="truncate text-[13px] text-ink">{item.name}</p>
                  <p className="mt-0.5 text-[11px] text-ink-subtle">{item.colorway}</p>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="tnum text-sm text-ink">
                      {item.latestCents !== null ? formatMoney(item.latestCents) : '—'}
                    </span>
                    <span
                      className={cn(
                        'tnum text-[11px]',
                        (item.multiple ?? 1) >= 1 ? 'text-up' : 'text-down',
                      )}
                    >
                      {item.multiple !== null ? formatMultiple(item.multiple) : ''}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <Callout tone="neutral" title="About this data">
        Product names reference real silhouettes. Every price, volume and listing figure on this page
        is synthetic, produced by a seeded generator so the demo and the test suite are reproducible
        offline. Point <code className="text-ink-muted">SOLEINDEX_PROVIDER=kicksdb</code> at a live
        API key to replace it.
      </Callout>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-right text-ink-muted">{children}</span>
    </div>
  );
}
