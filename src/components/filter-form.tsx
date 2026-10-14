'use client';

import { useRef, useTransition } from 'react';

import { cn } from '@/lib/utils';

/**
 * A `GET` form that submits whenever one of its controls changes.
 *
 * Filtering is therefore entirely server-driven: no client state, no fetch, no
 * hydration cost, and every filter combination is a real, shareable URL. The
 * `onChange` handler sits on the `<form>` rather than on each control, so it
 * catches bubbled change events from server-rendered children — which is what
 * lets the filter controls stay server components.
 */
export function FilterForm({
  children,
  className,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  action?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      method="get"
      action={action}
      className={cn('relative', className)}
      onChange={() => {
        startTransition(() => {});
        formRef.current?.requestSubmit();
      }}
      // Debounce-free: pressing Enter submits immediately, which matters for the
      // search field where auto-submitting on every keystroke would be worse.
      onSubmit={() => startTransition(() => {})}
    >
      {children}
      {pending ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-4 h-px animate-pulse bg-accent"
        />
      ) : null}
      <noscript>
        <button
          type="submit"
          className="mt-2 h-8 rounded-control border border-line-strong px-3 text-xs text-ink"
        >
          Apply filters
        </button>
      </noscript>
    </form>
  );
}

/** Search field that only submits on Enter, so typing does not reload the page. */
export function SearchField({
  name,
  defaultValue,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <input
      type="search"
      name={name}
      defaultValue={defaultValue}
      placeholder={placeholder}
      autoComplete="off"
      className="h-9 w-full rounded-control border border-line bg-canvas px-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-line-strong focus:border-accent focus:outline-none"
    />
  );
}
