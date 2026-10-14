/**
 * Publication and deletion controls.
 *
 * Server components, deliberately. Each control is a `<form>` whose `action` is
 * a Server Action **bound** to its arguments with `.bind(null, …)`. That is the
 * documented way to parameterise an action, and it avoids the alternative —
 * an inline `'use server'` closure — which would need the client bundle for no
 * benefit. There is no client JavaScript here at all.
 */
import { Button } from '@/components/ui/primitives';
import {
  removeInsight,
  toggleArticleStatus,
  toggleInsightStatus,
} from '@/lib/data/mutations';

export function InsightStatusToggle({
  id,
  status,
}: {
  id: string;
  status: 'draft' | 'published';
}) {
  const next = status === 'published' ? 'draft' : 'published';
  return (
    <form action={toggleInsightStatus.bind(null, id, next)}>
      <Button
        type="submit"
        variant={status === 'published' ? 'ghost' : 'primary'}
        size="sm"
        title={status === 'published' ? 'Move back to draft' : 'Publish this note'}
      >
        {status === 'published' ? 'Unpublish' : 'Publish'}
      </Button>
    </form>
  );
}

export function InsightDeleteButton({ id }: { id: string }) {
  return (
    <form action={removeInsight.bind(null, id)}>
      <Button type="submit" variant="ghost" size="sm" title="Delete this note">
        Delete
      </Button>
    </form>
  );
}

export function ArticleStatusToggle({
  id,
  status,
}: {
  id: string;
  status: 'draft' | 'published';
}) {
  const next = status === 'published' ? 'draft' : 'published';
  return (
    <form action={toggleArticleStatus.bind(null, id, next)}>
      <Button
        type="submit"
        variant={status === 'published' ? 'ghost' : 'primary'}
        size="sm"
        title={status === 'published' ? 'Move back to draft' : 'Publish this report'}
      >
        {status === 'published' ? 'Unpublish' : 'Publish'}
      </Button>
    </form>
  );
}
