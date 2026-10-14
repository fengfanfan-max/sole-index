/**
 * Catalogue — search, filtering, sorting and the comparison basket.
 *
 * Two deliberate choices:
 *
 *  1. **All filter state lives in the URL.** Every view is linkable and
 *     server-rendered. There is no client-side filter state to hydrate, and
 *     "send me the screen you are looking at" works by copying the address bar.
 *
 *  2. **The comparison basket is also just a URL parameter** (`?ids=`). Selecting
 *     a fourth product is an `<a>` whose href was computed on the server. It
 *     costs no JavaScript, which is why the table can stay a server component
 *     even though it is interactive.
 */
import Link from 'next/link';
import { X } from 'lucide-react';

import { MaterialChips, PageHeader, TrendChip } from '@/components/cards';
import { Sparkline } from '@/components/charts/charts';
import { FilterForm, SearchField } from '@/components/filter-form';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ScoreMeter,
  Select,
  Table,
  TableWrap,
  Td,
  Th,
} from '@/components/ui/primitives';
import {
  getFilterOptions,
  getSparklineSeries,
  listProducts,
  PRICE_BANDS,
  SORT_OPTIONS,
  type ProductRow,
  type SortKey,
} from '@/lib/data/catalog';
import { formatDate, formatMoney, formatMultiple, formatNumber, formatPercent, titleCase } from '@/lib/format';
import { COLOR_HEX } from '@/lib/palette';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PER_PAGE = 24;

interface SearchParams {
  q?: string;
  brand?: string;
  category?: string;
  color?: string;
  material?: string;
  band?: string;
  sort?: string;
  page?: string;
  ids?: string;
}

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
}

/** Rebuild the query string with a patch applied. Empty values are dropped. */
function withParams(current: SearchParams, patch: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  const merged: Record<string, string | undefined> = { ...current, ...patch };
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === '' || value === null) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `/products?${qs}` : '/products';
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const basket = parseIds(params.ids);

  const [result, options] = await Promise.all([
    listProducts({
      q: params.q,
      brand: params.brand,
      category: params.category,
      color: params.color,
      material: params.material,
      band: params.band,
      sort: (params.sort as SortKey | undefined) ?? 'tmi',
      page: Number(params.page ?? 1) || 1,
      perPage: PER_PAGE,
    }),
    getFilterOptions(),
  ]);

  const sparks = await getSparklineSeries(result.rows.map((r) => r.id), 14);

  const activeFilters: { label: string; href: string }[] = [];
  if (params.q) activeFilters.push({ label: `“${params.q}”`, href: withParams(params, { q: undefined }) });
  if (params.brand)
    activeFilters.push({
      label: options.brands.find((b) => b.id === params.brand)?.name ?? params.brand,
      href: withParams(params, { brand: undefined }),
    });
  if (params.category)
    activeFilters.push({
      label: options.categories.find((c) => c.id === params.category)?.name ?? params.category,
      href: withParams(params, { category: undefined }),
    });
  if (params.color)
    activeFilters.push({
      label: titleCase(params.color),
      href: withParams(params, { color: undefined }),
    });
  if (params.material)
    activeFilters.push({
      label: titleCase(params.material),
      href: withParams(params, { material: undefined }),
    });
  if (params.band && params.band !== 'all')
    activeFilters.push({
      label: PRICE_BANDS.find((b) => b.key === params.band)?.label ?? params.band,
      href: withParams(params, { band: undefined }),
    });

  const hasFilters = activeFilters.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Catalogue"
        title="Every tracked silhouette"
        description="Full-text search across names, colourways and style codes, combined with brand, category, colour, material and resale-multiple facets. Add up to four products to the comparison basket."
        action={
          <div className="text-right">
            <p className="tnum text-2xl font-semibold text-ink">{formatNumber(result.total)}</p>
            <p className="text-[11px] text-ink-subtle">
              of {formatNumber(options.brands.length)} brands · page {result.page}/{result.pageCount}
            </p>
          </div>
        }
      />

      {/* ------------------------------ filters ------------------------------ */}
      <Card className="p-4">
        <FilterForm className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <label className="sr-only" htmlFor="q">
                Search the catalogue
              </label>
              <SearchField
                name="q"
                defaultValue={params.q}
                placeholder="Search “Samba”, “olive”, “Air Max 1”, or a style code…"
              />
            </div>
            <div className="flex items-center gap-3 text-[11px] text-ink-subtle">
              <span>{formatNumber(result.total)} results</span>
              {hasFilters ? (
                <Link href="/products" className="text-accent hover:underline">
                  Clear all
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Select name="brand" defaultValue={params.brand ?? ''} aria-label="Brand">
              <option value="">All brands</option>
              {options.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.count})
                </option>
              ))}
            </Select>

            <Select name="category" defaultValue={params.category ?? ''} aria-label="Category">
              <option value="">All categories</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.count})
                </option>
              ))}
            </Select>

            <Select name="color" defaultValue={params.color ?? ''} aria-label="Primary colour">
              <option value="">All colours</option>
              {options.colors.map((c) => (
                <option key={c.key} value={c.key}>
                  {titleCase(c.key)} ({c.count})
                </option>
              ))}
            </Select>

            <Select name="material" defaultValue={params.material ?? ''} aria-label="Material">
              <option value="">All materials</option>
              {options.materials.map((m) => (
                <option key={m.key} value={m.key}>
                  {titleCase(m.key)} ({m.count})
                </option>
              ))}
            </Select>

            <Select name="band" defaultValue={params.band ?? 'all'} aria-label="Resale multiple">
              {PRICE_BANDS.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </Select>

            <Select name="sort" defaultValue={params.sort ?? 'tmi'} aria-label="Sort by">
              {SORT_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Preserve the basket across filter changes. */}
          {basket.length > 0 ? <input type="hidden" name="ids" value={basket.join(',')} /> : null}
        </FilterForm>

        {hasFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="label-caps">Active</span>
            {activeFilters.map((f) => (
              <Link
                // Keyed by the clearing href, which is unique per filter; two
                // filters can legitimately share a display label.
                key={f.href}
                href={f.href}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2 py-0.5 text-[11px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                {f.label}
                <X size={10} />
              </Link>
            ))}
          </div>
        ) : null}
      </Card>

      {/* ------------------------------- basket ------------------------------ */}
      {basket.length > 0 ? (
        <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent/30 bg-accent/6 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Badge tone="accent">Comparison basket · {basket.length}/4</Badge>
            <span className="text-xs text-ink-muted">
              {basket.length < 2
                ? 'Add at least one more product to compare.'
                : 'Ready to compare.'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={withParams(params, { ids: undefined })}
              className="text-xs text-ink-muted hover:text-ink"
            >
              Clear
            </Link>
            <Button
              href={basket.length >= 2 ? `/compare?ids=${basket.join(',')}` : withParams(params, {})}
              variant="primary"
              size="sm"
              aria-disabled={basket.length < 2}
              className={basket.length < 2 ? 'pointer-events-none opacity-50' : undefined}
            >
              Compare {basket.length} products
            </Button>
          </div>
        </div>
      ) : null}

      {/* ------------------------------- table ------------------------------- */}
      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No products match those filters"
              description="Try removing the material or multiple filter, or search for a broader term such as a brand name."
              action={
                <Button href="/products" variant="outline" size="sm">
                  Reset filters
                </Button>
              }
            />
          </div>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th className="w-8" />
                  <Th>Product</Th>
                  <Th>Colourway</Th>
                  <Th className="hidden xl:table-cell">Materials</Th>
                  <Th className="hidden lg:table-cell">Released</Th>
                  <Th align="right">Retail</Th>
                  <Th align="right">Resale</Th>
                  <Th align="right">Multiple</Th>
                  <Th align="right" className="hidden md:table-cell">30d</Th>
                  <Th align="right" className="hidden lg:table-cell">14w</Th>
                  <Th align="right">Momentum</Th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <ProductRowItem
                    key={row.id}
                    row={row}
                    spark={sparks.get(row.id) ?? []}
                    basket={basket}
                    params={params}
                  />
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {/* ----------------------------- pagination ---------------------------- */}
      {result.pageCount > 1 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          <Button
            href={withParams(params, { page: String(Math.max(1, result.page - 1)) })}
            variant="outline"
            size="sm"
            className={result.page <= 1 ? 'pointer-events-none opacity-40' : undefined}
          >
            ← Previous
          </Button>
          <span className="tnum text-xs text-ink-subtle">
            Page {result.page} of {result.pageCount}
          </span>
          <Button
            href={withParams(params, { page: String(Math.min(result.pageCount, result.page + 1)) })}
            variant="outline"
            size="sm"
            className={result.page >= result.pageCount ? 'pointer-events-none opacity-40' : undefined}
          >
            Next →
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Row                                                                         */
/* -------------------------------------------------------------------------- */

function ProductRowItem({
  row,
  spark,
  basket,
  params,
}: {
  row: ProductRow;
  spark: number[];
  basket: string[];
  params: SearchParams;
}) {
  const inBasket = basket.includes(row.id);
  const nextBasket = inBasket
    ? basket.filter((id) => id !== row.id)
    : basket.length >= 4
      ? basket
      : [...basket, row.id];
  const toggleHref = withParams(params, {
    ids: nextBasket.length > 0 ? nextBasket.join(',') : undefined,
  });
  const disabled = !inBasket && basket.length >= 4;

  return (
    <tr className="group transition-colors hover:bg-raised/40">
      <Td>
        {disabled ? (
          <span
            title="Comparison is limited to four products"
            className="grid h-5 w-5 place-items-center rounded border border-line text-[11px] text-ink-subtle/50"
          >
            +
          </span>
        ) : (
          <Link
            href={toggleHref}
            title={inBasket ? 'Remove from comparison' : 'Add to comparison'}
            aria-label={inBasket ? `Remove ${row.name} from comparison` : `Add ${row.name} to comparison`}
            className={cn(
              'grid h-5 w-5 place-items-center rounded border text-[11px] transition-colors',
              inBasket
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-line text-ink-subtle hover:border-accent hover:text-accent',
            )}
          >
            {inBasket ? '−' : '+'}
          </Link>
        )}
      </Td>

      <Td>
        <Link href={`/products/${row.slug}`} className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="h-7 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: COLOR_HEX[row.primaryColor] ?? COLOR_HEX.unknown }}
          />
          <span className="min-w-0">
            <span className="block max-w-64 truncate text-[13px] text-ink group-hover:text-accent">
              {row.name}
            </span>
            <span className="block text-[10px] text-ink-subtle">
              {row.brandName} · {row.categoryName} · {row.id}
            </span>
          </span>
        </Link>
      </Td>

      <Td className="text-[13px] text-ink-muted">{row.colorway}</Td>

      <Td className="hidden xl:table-cell">
        <MaterialChips materials={row.materials} />
      </Td>

      <Td className="hidden text-xs text-ink-subtle lg:table-cell">{formatDate(row.releaseDate)}</Td>

      <Td align="right" className="tnum text-[13px] text-ink-subtle">
        {formatMoney(row.retailPriceCents)}
      </Td>

      <Td align="right" className="tnum text-[13px] font-medium text-ink">
        {row.latestCents !== null ? formatMoney(row.latestCents) : '—'}
      </Td>

      <Td align="right">
        <span
          className={cn(
            'tnum text-[13px]',
            row.multiple === null
              ? 'text-ink-subtle'
              : row.multiple >= 1.25
                ? 'text-up'
                : row.multiple < 1
                  ? 'text-down'
                  : 'text-ink-muted',
          )}
        >
          {row.multiple !== null ? formatMultiple(row.multiple) : '—'}
        </span>
      </Td>

      <Td align="right" className="hidden md:table-cell">
        {row.change !== null ? (
          <span
            className={cn(
              'tnum text-xs',
              row.change > 0 ? 'text-up' : row.change < 0 ? 'text-down' : 'text-ink-subtle',
            )}
          >
            {formatPercent(row.change)}
          </span>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        )}
      </Td>

      <Td align="right" className="hidden lg:table-cell">
        {spark.length > 1 ? (
          <span className="inline-flex justify-end">
            <Sparkline values={spark} positive={(row.change ?? 0) >= 0} width={68} height={20} />
          </span>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        )}
      </Td>

      <Td align="right">
        {row.tmiScore !== null ? (
          <span className="inline-flex w-28 justify-end">
            <ScoreMeter score={row.tmiScore} />
          </span>
        ) : (
          <TrendChip score={null} />
        )}
      </Td>
    </tr>
  );
}
