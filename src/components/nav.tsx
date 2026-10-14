'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { resolveActiveHref } from '@/lib/nav';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  /** Rendered as a small lucide icon node. */
  icon?: React.ReactNode;
  /** Optional trailing badge, e.g. a count. */
  badge?: string;
  /** Shows a lock glyph for a section the current persona cannot open. */
  locked?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * A link that knows whether it is current.
 *
 * The active href is resolved across the **whole** navigation with
 * `resolveActiveHref`, not per link. Per-link prefix matching marked both
 * `/trends` and `/trends/methodology` as current on the methodology page, and the
 * same for `/admin` against `/admin/ops` and `/admin/editorial`.
 *
 * It stays a client component because an App Router layout is preserved across
 * navigations between its children, so a server-computed active state would go
 * stale the moment the reader clicked a sibling.
 */
export function NavLink({
  item,
  allHrefs,
  /** Set when the list is rendered on its own and cannot see its siblings. */
  activeHref,
}: {
  item: NavItem;
  allHrefs: readonly string[];
  activeHref?: string | null;
}) {
  const pathname = usePathname();
  const current = activeHref !== undefined ? activeHref : resolveActiveHref(pathname, allHrefs);
  const active = current === item.href;

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-2.5 rounded-control px-2.5 py-1.5 text-[13px] transition-colors',
        active
          ? 'bg-raised font-medium text-ink'
          : 'text-ink-muted hover:bg-raised/60 hover:text-ink',
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center',
          active ? 'text-accent' : 'text-ink-subtle group-hover:text-ink-muted',
        )}
      >
        {item.icon}
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span className="tnum rounded-full bg-canvas px-1.5 py-0.5 text-[10px] text-ink-subtle">
          {item.badge}
        </span>
      ) : null}
      {item.locked ? (
        <svg
          viewBox="0 0 24 24"
          className="h-3 w-3 text-ink-subtle"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-label="Requires a paid tier"
        >
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      ) : null}
    </Link>
  );
}

export function MobileNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const flat = sections.flatMap((s) => s.items);
  const activeHref = resolveActiveHref(
    pathname,
    flat.map((item) => item.href),
  );

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 lg:hidden">
      {flat.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={activeHref === item.href ? 'page' : undefined}
          className={cn(
            'shrink-0 rounded-control px-2.5 py-1 text-xs whitespace-nowrap transition-colors',
            activeHref === item.href
              ? 'bg-raised font-medium text-ink'
              : 'text-ink-muted hover:text-ink',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
