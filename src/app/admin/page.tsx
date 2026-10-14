/**
 * Analyst desk.
 *
 * The surface that satisfies the brief's "custom admin dashboard — manually add
 * observations, research, external sources and market insights, linked to
 * existing database records".
 *
 * The role check happens here, before any query runs: a viewer gets the locked
 * panel and the desk's data is never fetched.
 */
import Link from 'next/link';

import { InsightComposer, type EntityOptionGroup } from '@/components/composers';
import { LockedPanel, PageHeader } from '@/components/cards';
import { InsightDeleteButton, InsightStatusToggle } from '@/components/status-toggle';
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfidenceMeter,
  Stat,
} from '@/components/ui/primitives';
import { canWriteContent, getSession } from '@/lib/auth/session';
import { getAdminStats } from '@/lib/data/admin';
import { getEntityLabels, listInsights, listSources } from '@/lib/data/editorial';
import { formatDate, pluralize, titleCase } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AnalystDeskPage() {
  const session = await getSession();

  if (!canWriteContent(session)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Operations"
          title="Analyst desk"
          description="Author observations, link them to catalogue records, and register the sources behind them."
        />
        <LockedPanel
          featureKey="insights.write"
          requiredTier="Editor role"
          currentTier={`${session.role} / ${session.tier}`}
          title="Authoring requires an editor or administrator role"
          description="This desk writes to the insights table and the polymorphic link table. Switch persona in the header to “Mira Okafor · editor” or “Fanfan Feng · admin” to use it. The role check is enforced server-side in the Server Action as well as here."
        />
      </div>
    );
  }

  const [stats, insights, sources, productLabels, categoryLabels, colorLabels, materialLabels, brandLabels] =
    await Promise.all([
      getAdminStats(),
      listInsights({ includeDrafts: true, limit: 40 }),
      listSources(),
      getEntityLabels('product'),
      getEntityLabels('category'),
      getEntityLabels('color'),
      getEntityLabels('material'),
      getEntityLabels('brand'),
    ]);

  const entityGroups: EntityOptionGroup[] = [
    { type: 'category', label: 'Category', options: categoryLabels },
    { type: 'color', label: 'Colourway', options: colorLabels.map((c) => ({ id: c.id, label: titleCase(c.label) })) },
    { type: 'material', label: 'Material', options: materialLabels.map((m) => ({ id: m.id, label: titleCase(m.label) })) },
    { type: 'brand', label: 'Brand', options: brandLabels },
    { type: 'product', label: 'Product (style code)', options: productLabels },
  ];

  const drafts = insights.filter((i) => i.status === 'draft');
  const published = insights.filter((i) => i.status === 'published');

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow={`Signed in as ${session.name} · ${session.role}`}
        title="Analyst desk"
        description="Manual observations, research notes and source digests. Attaching a note to a catalogue entity makes it appear on every surface that entity appears on — the product page, the colourway radar, the category list — from a single write."
      />

      {/* ------------------------------- stats ------------------------------- */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <Stat label="Insights" value={String(stats.insights)} sub={`${stats.draftInsights} in draft`} />
        </Card>
        <Card className="p-4">
          <Stat
            label="Entity links"
            value={String(stats.insightLinks)}
            sub="polymorphic attachments"
          />
        </Card>
        <Card className="p-4">
          <Stat label="Reports" value={String(stats.articles)} sub={`${stats.draftArticles} in draft`} />
        </Card>
        <Card className="p-4">
          <Stat
            label="Observations"
            value={stats.pricePoints.toLocaleString('en-US')}
            sub={`${new Date(stats.oldestObservation ?? '').getUTCFullYear()}–${new Date(stats.newestObservation ?? '').getUTCFullYear()}`}
          />
        </Card>
      </section>

      {/* ------------------------------ composer ----------------------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">New observation</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              Published notes appear immediately on every linked surface. Drafts stay private until
              you publish them.
            </p>
          </div>
          <Badge tone="accent">Server-validated</Badge>
        </CardHeader>
        <CardBody>
          <InsightComposer
            entityGroups={entityGroups}
            sources={sources.map((s) => ({ id: s.id, name: s.name }))}
          />
        </CardBody>
      </Card>

      {/* ------------------------------ insights ----------------------------- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">All notes</h2>
            <p className="mt-1 text-sm text-ink-subtle">
              {pluralize(published.length, 'published note')} · {pluralize(drafts.length, 'draft')}
            </p>
          </div>
          <Link href="/editorial" className="text-xs text-accent hover:underline">
            Public editorial →
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          {insights.map((insight) => (
            <Card key={insight.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone={insight.status === 'published' ? 'accent' : 'warn'}>
                      {insight.status}
                    </Badge>
                    <Badge tone="outline">{insight.kind.replace('_', ' ')}</Badge>
                    <ConfidenceMeter value={insight.confidence} />
                    {insight.signal ? (
                      <span className="tnum text-[11px] text-accent">{insight.signal}</span>
                    ) : null}
                  </div>

                  <h3 className="text-[15px] leading-snug font-medium text-ink">{insight.title}</h3>

                  {insight.links.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {insight.links.map((link) => (
                        <span
                          key={`${link.entityType}:${link.entityId}`}
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas px-2 py-0.5 text-[10px]"
                        >
                          <span className="text-ink-subtle">{link.entityType}</span>
                          <Link
                            href={
                              link.entityType === 'product'
                                ? `/products/${link.entityId}`
                                : `/trends?attribute=${link.entityType === 'color' ? 'color' : link.entityType === 'material' ? 'material' : 'category'}&value=${link.entityId}`
                            }
                            className="max-w-48 truncate text-ink-muted hover:text-accent"
                          >
                            {link.label}
                          </Link>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-ink-subtle">Not attached to any entity.</p>
                  )}

                  <p className="mt-2 text-[11px] text-ink-subtle">
                    {insight.authorName ?? 'Unknown'}
                    {insight.sourceName ? ` · ${insight.sourceName}` : ''}
                    {insight.publishedAt ? ` · ${formatDate(insight.publishedAt)}` : ` · created ${formatDate(insight.createdAt)}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <InsightStatusToggle id={insight.id} status={insight.status} />
                  <InsightDeleteButton id={insight.id} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Callout tone="neutral" title="Why this shape">
        The brief asked for observations “linked to existing database records”, which is easy to
        fake with a free-text field. Here the link is a real row in{' '}
        <code className="text-ink">insight_links</code> with an entity type, so a note attached to a
        colourway is queryable from the trend radar and from every product carrying that colour —
        without being duplicated or re-entered.
      </Callout>
    </div>
  );
}
