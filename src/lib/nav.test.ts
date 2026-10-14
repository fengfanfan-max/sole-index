/**
 * Regression tests for navigation state.
 *
 * The bug these exist for: prefix matching highlighted a parent section on every
 * child page, so `/trends/methodology` lit both *Trend radar* and *Methodology*.
 * Nothing failed — no assertion, no type error, no server error — it just looked
 * wrong to a reader, which is exactly the class of defect that needs a test.
 */
import { describe, expect, it } from 'vitest';

import { hrefMatches, resolveActiveHref } from './nav';

/** The real application navigation, in the order the shell renders it. */
const NAV = [
  '/',
  '/products',
  '/compare',
  '/trends',
  '/trends/methodology',
  '/editorial',
  '/admin',
  '/admin/editorial',
  '/admin/ops',
  '/pricing',
  '/login',
] as const;

describe('resolveActiveHref — exactly one item is current', () => {
  it.each([
    ['/', '/'],
    ['/products', '/products'],
    ['/compare', '/compare'],
    ['/trends', '/trends'],
    ['/trends/methodology', '/trends/methodology'],
    ['/editorial', '/editorial'],
    ['/admin', '/admin'],
    ['/admin/editorial', '/admin/editorial'],
    ['/admin/ops', '/admin/ops'],
    ['/pricing', '/pricing'],
  ])('%s resolves to %s', (pathname, expected) => {
    expect(resolveActiveHref(pathname, NAV)).toBe(expected);
  });

  it('does not mark the parent active on a child page', () => {
    // The shipped bug, stated directly.
    expect(resolveActiveHref('/trends/methodology', NAV)).not.toBe('/trends');
    expect(resolveActiveHref('/admin/ops', NAV)).not.toBe('/admin');
    expect(resolveActiveHref('/admin/editorial', NAV)).not.toBe('/admin');
  });

  it('resolves every route in the app to the most specific match', () => {
    for (const pathname of NAV) {
      const active = resolveActiveHref(pathname, NAV);
      expect(active, `${pathname} resolved to nothing`).not.toBeNull();

      // Multiple hrefs *matching* a path is expected — a child route is owned by
      // its parent too. What matters is that resolution picks the longest.
      const matches = NAV.filter((href) => hrefMatches(pathname, href));
      const longest = matches.reduce((a, b) => (b.length > a.length ? b : a));
      expect(active, `${pathname} resolved to ${active}, not ${longest}`).toBe(longest);
    }
  });

  it('a child route is owned by its parent and itself, and the child wins', () => {
    // Stated explicitly because it surprised me: `hrefMatches` is "does this href
    // own this path", not "is this the active nav item".
    expect(NAV.filter((href) => hrefMatches('/trends/methodology', href))).toEqual([
      '/trends',
      '/trends/methodology',
    ]);
    expect(resolveActiveHref('/trends/methodology', NAV)).toBe('/trends/methodology');
  });

  it('keeps a section active on its detail pages that have no nav entry', () => {
    // Desirable, not a bug: a product page belongs to the catalogue.
    expect(resolveActiveHref('/products/new-balance-550-desert-ore', NAV)).toBe('/products');
    expect(resolveActiveHref('/editorial/q3-2026-resale-report', NAV)).toBe('/editorial');
  });
});

describe('hrefMatches', () => {
  it('never lets the root swallow every path', () => {
    expect(hrefMatches('/', '/')).toBe(true);
    expect(hrefMatches('/products', '/')).toBe(false);
    expect(hrefMatches('/anything/at/all', '/')).toBe(false);
  });

  it('requires a segment boundary, not a bare string prefix', () => {
    // `/admin` must not claim `/administrators`.
    expect(hrefMatches('/administrators', '/admin')).toBe(false);
    expect(hrefMatches('/admin/ops', '/admin')).toBe(true);
  });

  it('treats a trailing slash as the same route', () => {
    expect(hrefMatches('/trends/', '/trends')).toBe(true);
    expect(hrefMatches('/trends', '/trends/')).toBe(true);
    expect(hrefMatches('/trends/methodology/', '/trends/methodology')).toBe(true);
  });

  it('does not match an unrelated route', () => {
    expect(hrefMatches('/pricing', '/products')).toBe(false);
    expect(hrefMatches('/compare/more', '/comparison')).toBe(false);
  });
});

describe('resolveActiveHref — edge cases', () => {
  it('returns null for a route that is not in the navigation', () => {
    expect(resolveActiveHref('/this-page-does-not-exist', NAV)).toBeNull();
  });

  it('returns null for an empty navigation', () => {
    expect(resolveActiveHref('/products', [])).toBeNull();
  });

  it('picks the longer of two nested candidates regardless of input order', () => {
    expect(resolveActiveHref('/a/b/c', ['/a/b', '/a/b/c'])).toBe('/a/b/c');
    expect(resolveActiveHref('/a/b/c', ['/a/b/c', '/a/b'])).toBe('/a/b/c');
  });

  it('is stable for a deeply nested path', () => {
    expect(resolveActiveHref('/admin/ops/detail/42', ['/admin', '/admin/ops'])).toBe('/admin/ops');
  });
});
