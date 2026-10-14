/**
 * Content studio.
 *
 * The editorial CMS: compose a report in Markdown, save it as a draft, publish
 * it when it is ready. Reading time is derived from the body rather than asked
 * for, and the slug is generated from the headline with a collision check.
 */
import Link from 'next/link';

import { ArticleComposer } from '@/components/composers';
import { LockedPanel, PageHeader } from '@/components/cards';
import { ArticleStatusToggle } from '@/components/status-toggle';
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Stat,
} from '@/components/ui/primitives';
import { canWriteContent, getSession } from '@/lib/auth/session';
import { isEphemeralDatabase } from '@/lib/db-mode';
import { listArticles, listSources } from '@/lib/data/editorial';
import { getFilterOptions } from '@/lib/data/catalog';
import { formatDate, pluralize } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ContentStudioPage() {
  const session = await getSession();

  if (!canWriteContent(session)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Editorial"
          title="Content studio"
          description="Draft, preview and publish market reports."
        />
        <LockedPanel
          featureKey="articles.write"
          requiredTier="Editor role"
          currentTier={`${session.role} / ${session.tier}`}
          title="Publishing requires an editor or administrator role"
          description="The studio writes to the articles table. Switch persona in the header to an editor or admin account to use it."
        />
      </div>
    );
  }

  const [articles, filterOptions, sources] = await Promise.all([
    listArticles({ includeDrafts: true }),
    getFilterOptions(),
    listSources(),
  ]);

  const drafts = articles.filter((a) => a.status === 'draft');
  const published = articles.filter((a) => a.status === 'published');

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow={`Signed in as ${session.name} · ${session.role}`}
        title="Content studio"
        description="Reports are Markdown. Headings, lists, tables, bold and inline code all render on the public page; the reading time is estimated from the body at 200 words per minute rather than being a field you have to keep accurate by hand."
        action={
          <Link href="/editorial" className="text-xs text-accent hover:underline">
            View public editorial →
          </Link>
        }
      />

      {isEphemeralDatabase() ? (
        <Callout tone="warn" title="This deployment rebuilds its database on every cold start">
          The hosted demo runs embedded PostgreSQL in the platform&apos;s temporary filesystem, seeded
          from the committed snapshot on each new instance. Reads are unaffected — every dashboard,
          chart and report is real data. Writes you make here work for the life of the instance and
          are then discarded. Point <code className="text-ink">DATABASE_URL</code> at a managed
          PostgreSQL server to make them durable; see the README&apos;s deployment notes.
        </Callout>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <Stat label="Published" value={String(published.length)} sub="live on /editorial" />
        </Card>
        <Card className="p-4">
          <Stat label="Drafts" value={String(drafts.length)} sub="private to staff" />
        </Card>
        <Card className="p-4">
          <Stat label="Sources" value={String(sources.length)} sub="registered attributions" />
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">New report</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              Saving as a draft keeps it off every public surface. Publishing revalidates the
              editorial index and the home page.
            </p>
          </div>
          <Badge tone="accent">Markdown</Badge>
        </CardHeader>
        <CardBody>
          <ArticleComposer categories={filterOptions.categories.map((c) => ({ id: c.id, name: c.name }))} />
        </CardBody>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">All reports</h2>
        {articles.map((article) => (
          <Card key={article.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Badge tone={article.status === 'published' ? 'accent' : 'warn'}>
                    {article.status}
                  </Badge>
                  {article.categoryName ? <Badge tone="outline">{article.categoryName}</Badge> : null}
                  <span className="text-[11px] text-ink-subtle">
                    {article.readingMinutes} min ·{' '}
                    {article.publishedAt ? formatDate(article.publishedAt) : 'unpublished'}
                  </span>
                </div>
                <h3 className="text-[15px] leading-snug font-medium text-ink">{article.title}</h3>
                <p className="mt-1 line-clamp-2 text-[12px] text-ink-subtle">{article.excerpt}</p>
                <p className="mt-1.5 font-mono text-[10px] text-ink-subtle">/editorial/{article.slug}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/editorial/${article.slug}`}
                  className="rounded-control px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  Preview
                </Link>
                <ArticleStatusToggle id={article.id} status={article.status} />
              </div>
            </div>
          </Card>
        ))}
      </section>

      <Callout tone="neutral" title="What the CMS deliberately does not do">
        There is no rich-text WYSIWYG and no image pipeline. Both are real requirements for a
        production editorial team — the brief's third phase — and both are better served by a
        purpose-built integration (a headless CMS, or object storage plus an uploader) than by
        something half-built here. The schema and the publish flow are already in place for them.
      </Callout>
    </div>
  );
}
