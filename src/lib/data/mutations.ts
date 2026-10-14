'use server';

/**
 * Write paths for the analyst and editorial surfaces.
 *
 * Every action re-checks the session server-side before touching the database.
 * The UI also hides these forms from unauthorised users, but hiding a button is
 * not authorisation — a Server Action is a public HTTP endpoint, so the check
 * has to live here too.
 */
import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@/db/client';
import { articles, insightLinks, insights } from '@/db/schema';
import { canWriteContent, getSession } from '@/lib/auth/session';
import { execute } from '@/lib/data/query';

const ENTITY_TYPES = ['product', 'category', 'color', 'material', 'brand'] as const;
const INSIGHT_KINDS = ['observation', 'research', 'market_note', 'source_digest'] as const;

const insightSchema = z.object({
  title: z.string().trim().min(4, 'Give the note a title of at least 4 characters.').max(160),
  body: z.string().trim().min(20, 'A note needs at least a sentence of substance.').max(8000),
  kind: z.enum(INSIGHT_KINDS),
  confidence: z.coerce.number().int().min(1).max(5),
  signal: z.string().trim().max(120).optional(),
  sourceId: z.string().trim().optional(),
  status: z.enum(['draft', 'published']),
  /**
   * One `type:id` pair, e.g. `product:DZ5485-612` or `color:green`.
   *
   * A single flat control rather than a cascading type-then-id pair, because the
   * cascade needs client state to repopulate the second select. The schema
   * supports N links per insight; this form exposes one.
   */
  entity: z
    .string()
    .trim()
    .regex(/^(product|category|color|material|brand):.+$/, 'Pick a valid entity, or leave it blank.')
    .optional(),
});

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Field-level errors, keyed by input name. */
  errors?: Record<string, string>;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

/**
 * Create an analyst insight, optionally attached to one catalogue entity.
 *
 * The schema supports N links per insight; the form exposes one because a
 * multi-entity picker needs client state that is not worth shipping for the
 * demo. Seeded insights demonstrate multi-link attachments.
 */
export async function createInsight(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!canWriteContent(session)) {
    return { ok: false, message: 'Your role cannot author insights.' };
  }

  const parsed = insightSchema.safeParse({
    title: formData.get('title'),
    body: formData.get('body'),
    kind: formData.get('kind'),
    confidence: formData.get('confidence'),
    signal: formData.get('signal') || undefined,
    sourceId: formData.get('sourceId') || undefined,
    status: formData.get('status'),
    entity: formData.get('entity') || undefined,
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      errors[key] ??= issue.message;
    }
    return { ok: false, message: 'Check the highlighted fields.', errors };
  }

  const data = parsed.data;
  const db = await getDb();
  const now = new Date().toISOString();
  const id = `ins-${slugify(data.title).slice(0, 28)}-${Date.now().toString(36)}`;

  await db.insert(insights).values({
    id,
    kind: data.kind,
    title: data.title,
    body: data.body,
    authorId: session.userId,
    sourceId: data.sourceId ?? null,
    confidence: data.confidence,
    signal: data.signal ?? null,
    status: data.status,
    publishedAt: data.status === 'published' ? now : null,
  });

  // Split `type:id` on the first colon only — style codes can contain colons in
  // some catalogues, and ids may contain hyphens.
  const separator = data.entity?.indexOf(':') ?? -1;
  const entityType = data.entity && separator > 0
    ? (data.entity.slice(0, separator) as (typeof ENTITY_TYPES)[number])
    : null;
  const entityId = data.entity && separator > 0 ? data.entity.slice(separator + 1) : null;

  if (entityType && entityId) {
    await db
      .insert(insightLinks)
      .values({
        id: `${id}:${entityType}:${entityId}`,
        insightId: id,
        entityType,
        entityId,
      })
      .onConflictDoNothing();
  }

  revalidatePath('/admin');
  revalidatePath('/editorial');
  if (entityType === 'product' && entityId) {
    revalidatePath(`/products/${entityId}`);
  }
  revalidatePath('/trends');

  const attached = entityType ? ` and linked to ${entityType} “${entityId}”` : '';
  return {
    ok: true,
    message: `Saved "${data.title}" as ${data.status}${attached}. It is now visible on every linked surface.`,
  };
}

export async function setInsightStatus(
  insightId: string,
  status: 'draft' | 'published',
): Promise<ActionResult> {
  const session = await getSession();
  if (!canWriteContent(session)) {
    return { ok: false, message: 'Your role cannot change publication state.' };
  }

  const db = await getDb();
  await db
    .update(insights)
    .set({
      status,
      publishedAt: status === 'published' ? new Date().toISOString() : null,
    })
    .where(eq(insights.id, insightId));

  revalidatePath('/admin');
  revalidatePath('/editorial');
  revalidatePath('/trends');
  return { ok: true, message: `Insight is now ${status}.` };
}

export async function deleteInsight(insightId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!canWriteContent(session)) {
    return { ok: false, message: 'Your role cannot delete insights.' };
  }

  const db = await getDb();
  // insight_links cascades, so the joins clean themselves up.
  await db.delete(insights).where(eq(insights.id, insightId));

  revalidatePath('/admin');
  revalidatePath('/editorial');
  return { ok: true, message: 'Insight deleted.' };
}

/* -------------------------------------------------------------------------- */
/* Editorial                                                                   */
/* -------------------------------------------------------------------------- */

const articleSchema = z.object({
  title: z.string().trim().min(6, 'Give the report a real headline.').max(160),
  excerpt: z.string().trim().min(20, 'Write a one-sentence summary.').max(400),
  body: z.string().trim().min(80, 'A report needs at least a paragraph.').max(60_000),
  categoryId: z.string().trim().optional(),
  tags: z.string().trim().max(200).optional(),
  status: z.enum(['draft', 'published']),
});

export async function createArticle(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!canWriteContent(session)) {
    return { ok: false, message: 'Your role cannot publish editorial.' };
  }

  const parsed = articleSchema.safeParse({
    title: formData.get('title'),
    excerpt: formData.get('excerpt'),
    body: formData.get('body'),
    categoryId: formData.get('categoryId') || undefined,
    tags: formData.get('tags') || undefined,
    status: formData.get('status'),
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      errors[key] ??= issue.message;
    }
    return { ok: false, message: 'Check the highlighted fields.', errors };
  }

  const data = parsed.data;
  const db = await getDb();
  const now = new Date().toISOString();

  // Estimate reading time from the body rather than asking for it. ~200 wpm.
  const words = data.body.split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.round(words / 200));

  let slug = slugify(data.title);
  const [existing] = await execute<{ n: number }>(db, 
    sql`select count(*)::int as n from articles where slug = ${slug}`,
  ).then((r) => r.rows);
  if ((existing?.n ?? 0) > 0) slug = `${slug}-${Date.now().toString(36)}`;

  await db.insert(articles).values({
    id: `art-${slug.slice(0, 40)}`,
    slug,
    title: data.title,
    excerpt: data.excerpt,
    body: data.body,
    coverImageUrl: null,
    authorId: session.userId,
    categoryId: data.categoryId ?? null,
    tags: (data.tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    readingMinutes,
    status: data.status,
    publishedAt: data.status === 'published' ? now : null,
  });

  revalidatePath('/editorial');
  revalidatePath('/admin/editorial');
  revalidatePath('/');

  return {
    ok: true,
    message: `"${data.title}" saved as ${data.status} (${readingMinutes} min read, slug ${slug}).`,
  };
}

export async function setArticleStatus(
  articleId: string,
  status: 'draft' | 'published',
): Promise<ActionResult> {
  const session = await getSession();
  if (!canWriteContent(session)) {
    return { ok: false, message: 'Your role cannot change publication state.' };
  }

  const db = await getDb();
  await db
    .update(articles)
    .set({
      status,
      publishedAt: status === 'published' ? new Date().toISOString() : null,
    })
    .where(eq(articles.id, articleId));

  revalidatePath('/editorial');
  revalidatePath('/admin/editorial');
  revalidatePath('/');
  return { ok: true, message: `Report is now ${status}.` };
}

/* -------------------------------------------------------------------------- */
/* Form-action adapters                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `React` constrains a `<form action>` to a function returning
 * `void | Promise<void>`, while the actions above return a result so a client
 * form can display it. These thin adapters discard the result for the controls
 * that do not need one. The authorisation check still runs inside the wrapped
 * action — the adapter is a type bridge, not a bypass.
 */

export async function toggleInsightStatus(
  insightId: string,
  status: 'draft' | 'published',
): Promise<void> {
  await setInsightStatus(insightId, status);
}

export async function removeInsight(insightId: string): Promise<void> {
  await deleteInsight(insightId);
}

export async function toggleArticleStatus(
  articleId: string,
  status: 'draft' | 'published',
): Promise<void> {
  await setArticleStatus(articleId, status);
}
