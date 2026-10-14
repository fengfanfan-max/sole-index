/**
 * Article detail.
 *
 * Markdown is rendered with `marked` and injected as HTML, which is safe here for
 * a specific reason worth stating: the authoring surface is behind an
 * editor-or-admin role check, drafts are never publicly reachable, and no
 * untrusted user input reaches this renderer. If article bodies ever accept
 * third-party content, this is the line that needs sanitising.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { marked } from 'marked';

import { ArticleCard, PageHeader } from '@/components/cards';
import { Badge, Button, Callout, Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/primitives';
import { getSession, canWriteContent } from '@/lib/auth/session';
import { getArticle, listArticles } from '@/lib/data/editorial';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [article, session] = await Promise.all([getArticle(slug), getSession()]);

  // A draft is visible to its authors and to nobody else.
  if (!article) notFound();
  if (article.status === 'draft' && !canWriteContent(session)) notFound();

  const related = (await listArticles())
    .filter((a) => a.slug !== article.slug)
    .slice(0, 3);

  const html = await marked.parse(article.body, { gfm: true, breaks: false });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <nav className="text-[11px] text-ink-subtle">
        <Link href="/editorial" className="hover:text-ink">
          Editorial
        </Link>
        <span className="mx-2">/</span>
        <span>{article.categoryName ?? 'Market analysis'}</span>
      </nav>

      {article.status === 'draft' ? (
        <Callout tone="warn" title="This is a draft">
          Only editors and administrators can see this page while it is unpublished.
        </Callout>
      ) : null}

      <PageHeader
        eyebrow={article.categoryName ?? 'Market analysis'}
        title={article.title}
        description={article.excerpt}
        action={
          <div className="flex flex-col items-end gap-2">
            <Badge tone={article.status === 'published' ? 'accent' : 'warn'}>
              {article.status}
            </Badge>
            <span className="text-[11px] text-ink-subtle">
              {article.readingMinutes} min read
              {article.publishedAt ? ` · ${formatDate(article.publishedAt, 'long')}` : ''}
            </span>
          </div>
        }
      />

      {article.authorName ? (
        <p className="border-y border-line py-3 text-xs text-ink-subtle">
          By <span className="text-ink-muted">{article.authorName}</span>
          {article.tags.length > 0 ? (
            <>
              {' · '}
              {article.tags.map((t) => `#${t}`).join('  ')}
            </>
          ) : null}
        </p>
      ) : null}

      <article
        className="prose-editorial"
        // See the module comment: trusted, role-gated authoring only.
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {related.length > 0 ? (
        <section className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle as="h2">More from the desk</CardTitle>
            </CardHeader>
            <div className="grid gap-4 p-4 sm:grid-cols-3">
              {related.map((a) => (
                <ArticleCard key={a.slug} article={a} />
              ))}
            </div>
            <CardFooter>
              <Link href="/editorial" className="text-accent hover:underline">
                All reports →
              </Link>
            </CardFooter>
          </Card>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button href="/editorial" variant="outline" size="sm">
          ← All reports
        </Button>
        <Button href="/trends" variant="ghost" size="sm">
          Trend radar
        </Button>
      </div>
    </div>
  );
}
