/**
 * Persona picker.
 *
 * Not a real login. The brief needs a role-gated admin surface and an
 * architecture that can carry subscriptions; it does not need an OAuth
 * dependency that adds a credential setup step to every demo. This page makes the
 * three entitlements one click apart, which is what actually demonstrates that
 * the gates work.
 */
import Link from 'next/link';

import { PageHeader } from '@/components/cards';
import { Badge, Button, Callout, Card, CardBody, CardHeader, CardTitle } from '@/components/ui/primitives';
import { signInAs } from '@/lib/auth/actions';
import { DEMO_USERS, getSession, ROLE_LABELS, TIER_LABELS } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const PERSONA_NOTES: Record<string, string> = {
  'u-fanfan':
    'Full administrative access: the analyst desk, the content studio, operations, and every Pro and Enterprise feature.',
  'u-editor':
    'Can author observations and publish reports, and can see the trend radar. Cannot reach the operations view.',
  'u-viewer':
    'The free tier. The trend radar renders a locked panel and the trend queries are never issued — the gate is server-side, so the data genuinely is not sent.',
};

export default async function LoginPage() {
  const session = await getSession();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        eyebrow="Demo"
        title="Choose a persona"
        description="This project ships three accounts so the role and tier gates can be evaluated without setting up OAuth. Switching persona issues a signed session cookie; the server re-reads it on every request."
        action={
          <Link href="/" className="text-xs text-accent hover:underline">
            Back to the dashboard →
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {DEMO_USERS.map((persona) => {
          const isCurrent = persona.userId === session.userId;
          return (
            <Card key={persona.userId} sheen={isCurrent} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="grid h-8 w-8 place-items-center rounded-full bg-raised text-[11px] font-semibold text-accent"
                  >
                    {persona.initials}
                  </span>
                  <div>
                    <CardTitle as="h2">{persona.name}</CardTitle>
                    <p className="mt-0.5 text-[11px] text-ink-subtle">{persona.email}</p>
                  </div>
                </div>
              </CardHeader>
              <CardBody className="flex flex-1 flex-col gap-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="outline">{ROLE_LABELS[persona.role]}</Badge>
                  <Badge tone={persona.tier === 'free' ? 'neutral' : 'accent'}>
                    {TIER_LABELS[persona.tier]}
                  </Badge>
                  {isCurrent ? <Badge tone="up">Current</Badge> : null}
                </div>
                <p className="text-[12px] leading-relaxed text-ink-subtle">
                  {PERSONA_NOTES[persona.userId]}
                </p>
              </CardBody>
              <div className="border-t border-line p-3">
                <form action={signInAs}>
                  <input type="hidden" name="userId" value={persona.userId} />
                  <input type="hidden" name="next" value="/" />
                  <Button
                    type="submit"
                    variant={isCurrent ? 'outline' : 'primary'}
                    size="sm"
                    className="w-full"
                  >
                    {isCurrent ? 'Already signed in' : `Sign in as ${persona.name.split(' ')[0]}`}
                  </Button>
                </form>
              </div>
            </Card>
          );
        })}
      </div>

      <Callout tone="neutral" title="Session handling">
        The cookie is an HMAC-signed JSON payload — a real signature, so a visitor cannot promote
        their own tier by editing it. In a production deployment this module is replaced by the
        chosen provider (Auth.js or Clerk); the rest of the application only ever calls{' '}
        <code className="text-ink">getSession()</code> and <code className="text-ink">hasTier()</code>,
        so the call sites do not change.
      </Callout>

      <Callout tone="warn" title="Before deploying this anywhere">
        Change <code className="text-ink">SOLEINDEX_SESSION_SECRET</code>. The default is a
        development placeholder and is public in the repository.
      </Callout>
    </div>
  );
}
