'use client';

import { useRef, useTransition } from 'react';

import { signInAs } from '@/lib/auth/actions';
import { cn } from '@/lib/utils';

export interface PersonaOption {
  userId: string;
  name: string;
  email: string;
  role: string;
  tier: string;
  initials: string;
}

/**
 * Demo persona switcher.
 *
 * Submits on change rather than on a button press: the whole point of the
 * control is to make locked and unlocked states one click apart, and a two-step
 * interaction breaks that flow. It degrades to a normal form submit without JS.
 */
export function PersonaSwitcher({
  personas,
  currentUserId,
  className,
}: {
  personas: readonly PersonaOption[];
  currentUserId: string;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  const current = personas.find((p) => p.userId === currentUserId) ?? personas[0];

  return (
    <form
      ref={formRef}
      action={signInAs}
      className={cn('relative', className)}
      onSubmit={() => startTransition(() => {})}
    >
      <input type="hidden" name="next" value="/" />
      <label className="sr-only" htmlFor="persona-select">
        Switch demo persona
      </label>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-raised text-[10px] font-semibold text-accent"
        >
          {current?.initials}
        </span>
        <select
          id="persona-select"
          name="userId"
          defaultValue={currentUserId}
          disabled={pending}
          onChange={() => formRef.current?.requestSubmit()}
          className="h-8 cursor-pointer rounded-control border border-line bg-canvas pr-7 pl-2.5 text-xs text-ink transition-colors hover:border-line-strong focus:border-accent focus:outline-none"
          style={{
            appearance: 'none',
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2398a1ac' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 0.4rem center',
            backgroundSize: '12px',
          }}
        >
          {personas.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.name} · {p.role} · {p.tier}
            </option>
          ))}
        </select>
      </div>
      <noscript>
        <button type="submit" className="mt-1 text-[10px] text-accent underline">
          Switch
        </button>
      </noscript>
    </form>
  );
}
