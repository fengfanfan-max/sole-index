'use client';

/**
 * Authoring forms.
 *
 * These are the only genuinely stateful components in the product. They use
 * React 19's `useActionState`, which means the whole write path — validation,
 * authorisation, persistence, revalidation — happens in a Server Action, and the
 * client is only responsible for rendering the returned message.
 *
 * That matters for the same reason the paywall gate does: the role check lives
 * on the server. A hidden button is not authorisation.
 */
import { useActionState } from 'react';

import { createArticle, createInsight, type ActionResult } from '@/lib/data/mutations';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export interface EntityOptionGroup {
  type: 'product' | 'category' | 'color' | 'material' | 'brand';
  label: string;
  options: { id: string; label: string }[];
}

function ResultBanner({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <div
      role="status"
      className={cn(
        'rounded-control border px-3 py-2 text-xs leading-relaxed',
        state.ok ? 'border-up/30 bg-up/8 text-up' : 'border-down/30 bg-down/8 text-down',
      )}
    >
      {state.message}
    </div>
  );
}

function FieldError({ state, name }: { state: ActionResult | null; name: string }) {
  const message = state?.errors?.[name];
  if (!message) return null;
  return <span className="text-[11px] text-down">{message}</span>;
}

/* -------------------------------------------------------------------------- */
/* Insight composer                                                            */
/* -------------------------------------------------------------------------- */

export function InsightComposer({
  entityGroups,
  sources,
}: {
  entityGroups: EntityOptionGroup[];
  sources: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => createInsight(formData),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2">
          <Input name="title" placeholder="Olive is absorbing share from triple-black" required />
          <FieldError state={state} name="title" />
        </Field>

        <Field label="Kind">
          <Select name="kind" defaultValue="observation">
            <option value="observation">Observation</option>
            <option value="research">Research</option>
            <option value="market_note">Market note</option>
            <option value="source_digest">Source digest</option>
          </Select>
        </Field>

        <Field label="Confidence" hint="1 = speculative, 5 = high conviction">
          <Select name="confidence" defaultValue="3">
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} / 5
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Signal" hint="Optional one-line metric, e.g. “+6.1pp in 18 months”">
          <Input name="signal" placeholder="+6.1pp share" maxLength={120} />
        </Field>

        <Field label="Source">
          <Select name="sourceId" defaultValue="">
            <option value="">No source</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Attach to"
          className="sm:col-span-2"
          hint="The note will appear on this entity's page, and on any other surface that entity appears on."
        >
          <Select name="entity" defaultValue="">
            <option value="">Not attached to anything</option>
            {entityGroups.map((group) => (
              <optgroup key={group.type} label={group.label}>
                {group.options.map((option) => (
                  <option key={`${group.type}:${option.id}`} value={`${group.type}:${option.id}`}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <FieldError state={state} name="entity" />
        </Field>

        <Field label="Body" className="sm:col-span-2">
          <Textarea
            name="body"
            rows={7}
            placeholder="What did you observe, and what does it imply? State the mechanism, not just the move."
            required
          />
          <FieldError state={state} name="body" />
        </Field>

        <Field label="Publication">
          <Select name="status" defaultValue="published">
            <option value="published">Publish immediately</option>
            <option value="draft">Save as draft</option>
          </Select>
        </Field>
      </div>

      <ResultBanner state={state} />

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save observation'}
        </Button>
        <span className="text-[11px] text-ink-subtle">
          Server-validated and role-checked; the form is a convenience, not the control.
        </span>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Article composer                                                            */
/* -------------------------------------------------------------------------- */

export function ArticleComposer({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => createArticle(formData),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Headline" className="sm:col-span-2">
          <Input name="title" placeholder="Q4 2026 Resale Report" required />
          <FieldError state={state} name="title" />
        </Field>

        <Field label="Standfirst" className="sm:col-span-2" hint="One sentence, 20–400 characters.">
          <Textarea name="excerpt" rows={2} required />
          <FieldError state={state} name="excerpt" />
        </Field>

        <Field label="Category">
          <Select name="categoryId" defaultValue="">
            <option value="">Uncategorised</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tags" hint="Comma separated">
          <Input name="tags" placeholder="market-report, q4-2026" />
        </Field>

        <Field
          label="Body"
          className="sm:col-span-2"
          hint="Markdown. Headings (##), lists, tables, bold and inline code are all supported. Reading time is estimated automatically."
        >
          <Textarea
            name="body"
            rows={16}
            className="font-mono text-[12px]"
            placeholder={'## The headline number\n\nMarkdown body…'}
            required
          />
          <FieldError state={state} name="body" />
        </Field>

        <Field label="Publication">
          <Select name="status" defaultValue="draft">
            <option value="draft">Save as draft</option>
            <option value="published">Publish immediately</option>
          </Select>
        </Field>
      </div>

      <ResultBanner state={state} />

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save report'}
        </Button>
        <Badge tone="outline">Drafts are visible only to editors and admins</Badge>
      </div>
    </form>
  );
}
