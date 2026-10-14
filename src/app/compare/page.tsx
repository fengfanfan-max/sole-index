/**
 * Comparison.
 *
 * The centrepiece decision: series are **rebased to 100 at the start of the
 * window**. A $70 Vans and a $215 Air Jordan cannot be compared on absolute
 * price, and putting them on a dual axis is the standard way to produce a chart
 * that looks informative and means nothing. Rebasing answers the only question
 * that matters here — which one actually performed better.
 */
import Link from 'next/link';

import { PageHeader } from '@/components/cards';
import { CompareChart, ShareTrendChart } from '@/components/charts/charts';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ScoreMeter,
  Stat,
  Swatch,
  Table,
  TableWrap,
  Td,
  Th,
} from '@/components/ui/primitives';
import {
  getPriceSeries,
  getProductByIdOrSlug,
  getSalesSeries,
  type ProductDetail,
} from '@/lib/data/catalog';
import { formatDate, formatMoney, formatMultiple, formatNumber, formatPercent, titleCase } from '@/lib/format';
import { COLOR_HEX } from '@/lib/palette';
import { cn } from '@/lib/utils';
import { toCompareSeries } from '@/lib/charts/compare';

export const dynamic = 'force-dynamic';

const MAX_COMPARE = 4;

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const params = await searchParams;
  const ids = (params.ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_COMPARE);

  if (ids.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Compare"
          title="Side-by-side comparison"
          description="Pick up to four products from the catalogue and compare how they actually performed — rebased so a $70 pair and a $215 pair are on the same scale."
        />
        <EmptyState
          title="Nothing selected yet"
          description="Open the catalogue and use the + control at the start of each row to build a comparison. The basket is carried in the URL, so the view is shareable."
          action={
            <Button href="/products" variant="primary" size="sm">
              Open the catalogue
            </Button>
          }
        />
      </div>
    );
  }

  const products = (await Promise.all(ids.map((id) => getProductByIdOrSlug(id)))).filter(
    (p): p is ProductDetail => p !== null,
  );

  if (products.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Compare" title="Side-by-side comparison" />
        <EmptyState
          title="None of those products could be found"
          description="The style codes in the link may be stale."
          action={
            <Button href="/products" variant="primary" size="sm">
              Back to the catalogue
            </Button>
          }
        />
      </div>
    );
  }

  const seriesSets = await Promise.all(
    products.map(async (product) => {
      const [prices, sales] = await Promise.all([
        getPriceSeries(product.id),
        getSalesSeries(product.id),
      ]);
      return { product, prices, sales };
    }),
  );

  // `toCompareSeries` derives labels that are unique across the selection and
  // keeps the style code as the series identity. Keying by the display label
  // silently dropped a line whenever two colourways of one silhouette were
  // compared — which is exactly what the product page's "Compare these" button
  // pre-selects.
  const compareSeries = toCompareSeries(
    seriesSets.map(({ product }) => ({
      id: product.id,
      name: product.name,
      brandName: product.brandName,
      silhouette: product.silhouette,
      colorway: product.colorway,
    })),
    new Map(
      seriesSets.map(({ product, prices }) => [
        product.id,
        prices.map((p) => ({ date: p.date, value: p.lastSaleCents })),
      ]),
    ),
  );

  // Ranking of the metric that matters: total return over the window.
  const performance = seriesSets
    .map(({ product, prices }) => {
      const first = prices.find((p) => (p.lastSaleCents ?? 0) > 0)?.lastSaleCents ?? 0;
      const last = prices[prices.length - 1]?.lastSaleCents ?? 0;
      return {
        product,
        first,
        last,
        ret: first > 0 ? last / first - 1 : 0,
      };
    })
    .sort((a, b) => b.ret - a.ret);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Compare"
        title={`${products.length} products, rebased to 100`}
        description="Every series starts at 100 on the first observation in its own history, so the lines show relative performance rather than price level."
        action={
          <div className="flex items-center gap-2">
            <Button href="/products" variant="outline" size="sm">
              Edit basket
            </Button>
            <Button href="/compare" variant="ghost" size="sm">
              Clear
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Performance over the window</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              Indexed to the first observation. 100 = the product&apos;s own starting price.
            </p>
          </div>
        </CardHeader>
        <CardBody className="pt-2">
          <CompareChart series={compareSeries} height={340} />
        </CardBody>
      </Card>

      {/* ---------------------------- attribute diff ---------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle as="h2">Attribute diff</CardTitle>
        </CardHeader>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Attribute</Th>
                {products.map((p) => (
                  <Th key={p.id} align="right">
                    <span className="text-ink">{p.silhouette}</span>
                    <span className="ml-1 text-ink-subtle">{p.colorway}</span>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td className="text-ink-subtle">Brand</Td>
                {products.map((p) => (
                  <Td key={p.id} align="right" className="text-ink">
                    {p.brandName}
                  </Td>
                ))}
              </tr>
              <tr>
                <Td className="text-ink-subtle">Category</Td>
                {products.map((p) => (
                  <Td key={p.id} align="right" className="text-ink-muted">
                    {p.categoryName}
                  </Td>
                ))}
              </tr>
              <tr>
                <Td className="text-ink-subtle">Colour</Td>
                {products.map((p) => (
                  <Td key={p.id} align="right">
                    <span className="inline-flex justify-end">
                      <Swatch
                        hex={COLOR_HEX[p.primaryColor] ?? COLOR_HEX.unknown}
                        label={titleCase(p.primaryColor)}
                      />
                    </span>
                  </Td>
                ))}
              </tr>
              <tr>
                <Td className="text-ink-subtle">Materials</Td>
                {products.map((p) => (
                  <Td key={p.id} align="right" className="text-ink-muted">
                    {p.materials.map(titleCase).join(', ')}
                  </Td>
                ))}
              </tr>
              <tr>
                <Td className="text-ink-subtle">Released</Td>
                {products.map((p) => (
                  <Td key={p.id} align="right" className="text-ink-muted">
                    {formatDate(p.releaseDate)}
                  </Td>
                ))}
              </tr>
              <tr className="bg-raised/40">
                <Td className="text-ink-subtle">Retail</Td>
                {products.map((p) => (
                  <Td key={p.id} align="right" className="tnum text-ink">
                    {formatMoney(p.retailPriceCents)}
                  </Td>
                ))}
              </tr>
              <tr>
                <Td className="text-ink-subtle">Resale</Td>
                {products.map((p) => (
                  <Td key={p.id} align="right" className="tnum font-medium text-ink">
                    {p.latestCents !== null ? formatMoney(p.latestCents) : '—'}
                  </Td>
                ))}
              </tr>
              <tr>
                <Td className="text-ink-subtle">Multiple</Td>
                {products.map((p) => (
                  <Td key={p.id} align="right" className="tnum">
                    <span className={cn((p.multiple ?? 1) >= 1 ? 'text-up' : 'text-down')}>
                      {p.multiple !== null ? formatMultiple(p.multiple) : '—'}
                    </span>
                  </Td>
                ))}
              </tr>
              <tr>
                <Td className="text-ink-subtle">30-day change</Td>
                {products.map((p) => (
                  <Td key={p.id} align="right" className="tnum">
                    <span
                      className={cn(
                        (p.change ?? 0) > 0 ? 'text-up' : (p.change ?? 0) < 0 ? 'text-down' : 'text-ink-subtle',
                      )}
                    >
                      {p.change !== null ? formatPercent(p.change) : '—'}
                    </span>
                  </Td>
                ))}
              </tr>
              <tr>
                <Td className="text-ink-subtle">Units (4w)</Td>
                {products.map((p) => (
                  <Td key={p.id} align="right" className="tnum text-ink-muted">
                    {formatNumber(p.volume4w)}
                  </Td>
                ))}
              </tr>
              <tr>
                <Td className="text-ink-subtle">Momentum</Td>
                {products.map((p) => (
                  <Td key={p.id} align="right">
                    <span className="inline-flex w-24 justify-end">
                      {p.tmiScore !== null ? (
                        <ScoreMeter score={p.tmiScore} />
                      ) : (
                        <span className="text-xs text-ink-subtle">—</span>
                      )}
                    </span>
                  </Td>
                ))}
              </tr>
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      {/* ------------------------------ ranking ------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Return ranking</CardTitle>
              <p className="mt-0.5 text-xs text-ink-subtle">
                Change in resale price across the full window, first observation to last.
              </p>
            </div>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            {performance.map((entry, index) => (
              <div key={entry.product.id} className="flex items-center gap-3">
                <span className="tnum w-4 text-xs text-ink-subtle">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">{entry.product.name}</span>
                  <span className="block text-[10px] text-ink-subtle">
                    {formatMoney(entry.first)} → {formatMoney(entry.last)}
                  </span>
                </span>
                <Badge tone={entry.ret >= 0 ? 'up' : 'down'}>{formatPercent(entry.ret)}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Side-by-side metrics</CardTitle>
              <p className="mt-0.5 text-xs text-ink-subtle">
                Absolute values, for when the level matters more than the relative move.
              </p>
            </div>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-6">
            {products.map((p) => (
              <div key={p.id} className="flex flex-col gap-3">
                <div>
                  <p className="truncate text-[13px] font-medium text-ink">{p.silhouette}</p>
                  <p className="text-[11px] text-ink-subtle">{p.colorway}</p>
                </div>
                <Stat label="Resale" value={p.latestCents !== null ? formatMoney(p.latestCents) : '—'} />
                <Stat
                  label="Multiple"
                  value={p.multiple !== null ? formatMultiple(p.multiple) : '—'}
                  delta={p.change ?? undefined}
                />
                <Stat label="Units (4w)" value={formatNumber(p.volume4w)} />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Callout tone="accent" title="Why rebase rather than plot price?">
        Absolute price would make the chart a ranking of retail price, not performance — the most
        expensive pair would dominate every axis. Rebasing to 100 answers the question a comparison
        is actually asked to answer. The absolute numbers are still here, one table down.
      </Callout>
    </div>
  );
}
