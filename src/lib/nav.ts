/**
 * Navigation state resolution.
 *
 * Pure and unit tested, because getting this subtly wrong produces a UI that
 * looks broken without failing anything.
 *
 * The rule is **longest matching href wins**, not "any prefix matches". A naive
 * `pathname.startsWith(href)` marks a parent section active on every child page,
 * so a reader sitting on `/trends/methodology` sees both *Trend radar* and
 * *Methodology* highlighted and cannot tell where they are. The same defect
 * appears on `/admin/ops` and `/admin/editorial` against their `/admin` parent.
 *
 * Longest-match also happens to give the behaviour we want where a section has no
 * nav entry of its own: `/products/new-balance-550-desert-ore` resolves to
 * `/products`, so *Catalogue* stays lit while browsing a product — which is the
 * signal a reader expects from a section, not a bug.
 */

/** Strip a trailing slash so `/trends/` and `/trends` resolve identically. */
function normalise(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.replace(/\/+$/, '');
  return pathname;
}

/**
 * Does `href` own `pathname`?
 *
 * `/` only ever matches itself — otherwise every absolute path would match the
 * root and the whole sidebar would light up.
 */
export function hrefMatches(pathname: string, href: string): boolean {
  const path = normalise(pathname);
  const target = normalise(href);
  if (target === '/') return path === '/';
  return path === target || path.startsWith(`${target}/`);
}

/**
 * The href a reader should see as current, or `null` when the route is not in the
 * navigation at all (a 404, or a page reached from elsewhere).
 */
export function resolveActiveHref(
  pathname: string,
  hrefs: readonly string[],
): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!hrefMatches(pathname, href)) continue;
    // Ties cannot happen: two distinct hrefs of equal length cannot both be a
    // prefix of the same path.
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}
