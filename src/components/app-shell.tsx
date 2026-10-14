/**
 * Application shell.
 *
 * A server component: the nav, the persona switcher's data and the runtime
 * banner are all resolved on the server, so the layout ships almost no client
 * JavaScript. Only the two genuinely interactive fragments (current-link
 * highlighting and the persona select) are client components.
 */
import {
  BookOpen,
  CreditCard,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  Newspaper,
  PenLine,
  Search,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

import { MobileNav, NavLink, type NavSection } from '@/components/nav';
import { PersonaSwitcher } from '@/components/persona-switcher';
import { Badge } from '@/components/ui/primitives';
import { hasTier, getSession, DEMO_USERS, ROLE_LABELS, TIER_LABELS } from '@/lib/auth/session';

const icon = (node: React.ReactNode) => <span className="contents">{node}</span>;

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const paid = hasTier(session, 'pro');
  const isAdmin = session.role === 'admin';
  const canWrite = isAdmin || session.role === 'editor';

  const sections: NavSection[] = [
    {
      title: 'Market',
      items: [
        { href: '/', label: 'Overview', icon: icon(<LayoutDashboard size={14} />) },
        { href: '/products', label: 'Catalogue', icon: icon(<Search size={14} />) },
        { href: '/compare', label: 'Compare', icon: icon(<GitCompareArrows size={14} />) },
      ],
    },
    {
      title: 'Intelligence',
      items: [
        {
          href: '/trends',
          label: 'Trend radar',
          icon: icon(<TrendingUp size={14} />),
          locked: !paid,
        },
        {
          href: '/trends/methodology',
          label: 'Methodology',
          icon: icon(<FlaskConical size={14} />),
        },
      ],
    },
    {
      title: 'Editorial',
      items: [
        { href: '/editorial', label: 'Reports', icon: icon(<BookOpen size={14} />) },
        {
          href: '/admin',
          label: 'Analyst desk',
          icon: icon(<PenLine size={14} />),
          locked: !canWrite,
        },
        {
          href: '/admin/editorial',
          label: 'Content studio',
          icon: icon(<Newspaper size={14} />),
          locked: !canWrite,
        },
      ],
    },
    {
      title: 'Account',
      items: [
        { href: '/pricing', label: 'Plans', icon: icon(<CreditCard size={14} />) },
        { href: '/admin/ops', label: 'Operations', icon: icon(<ShieldCheck size={14} />), locked: !isAdmin },
      ],
    },
  ];

  const provider = (process.env.SOLEINDEX_PROVIDER ?? 'fixture').toLowerCase();
  const driver = (process.env.SOLEINDEX_DB_DRIVER ?? 'pglite').toLowerCase();

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* ------------------------------- sidebar ------------------------------- */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <Link href="/" className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid h-6 w-6 place-items-center rounded-[7px] bg-accent text-[11px] font-bold text-accent-ink"
            >
              S
            </span>
            <span className="text-sm font-semibold tracking-tight">SoleIndex</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.title} className="mb-5">
              <p className="mb-1.5 px-2.5 label-caps">{section.title}</p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.href} item={item} exact={item.href === '/'} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-line px-3 py-3">
          <div className="mb-2 rounded-control bg-canvas/60 px-2.5 py-2">
            <p className="text-[10px] leading-tight text-ink-subtle">
              Data source
              <br />
              <span className="font-medium text-ink-muted">
                {provider === 'kicksdb' ? 'KicksDB (live)' : 'Committed snapshot'}
              </span>
            </p>
          </div>
          <p className="px-1 text-[10px] leading-relaxed text-ink-subtle">
            {ROLE_LABELS[session.role]} · {TIER_LABELS[session.tier]} · {driver}
          </p>
        </div>
      </aside>

      {/* -------------------------------- main -------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <span
              aria-hidden
              className="grid h-6 w-6 place-items-center rounded-[7px] bg-accent text-[11px] font-bold text-accent-ink"
            >
              S
            </span>
            <span className="text-sm font-semibold tracking-tight">SoleIndex</span>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <Badge tone="accent">Demo dataset</Badge>
            <span className="text-xs text-ink-subtle">
              Resale market intelligence · {provider === 'kicksdb' ? 'live feed' : '18 months, 240 silhouettes'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/pricing"
              className="hidden text-xs text-ink-muted transition-colors hover:text-ink sm:block"
            >
              {paid ? 'Manage plan' : 'Upgrade'}
            </Link>
            <PersonaSwitcher
              personas={DEMO_USERS}
              currentUserId={session.userId}
            />
          </div>
        </header>

        <MobileNav sections={sections} />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>

        <footer className="border-t border-line px-6 py-4 text-[11px] leading-relaxed text-ink-subtle">
          Product names reference real silhouettes; every price, volume and listing figure is
          synthetic, produced by a seeded generator so the demo and the test suite are reproducible
          offline. Point <code className="text-ink-muted">SOLEINDEX_PROVIDER=kicksdb</code> at a live
          API key to replace the snapshot. ·{' '}
          <Link href="/trends/methodology" className="text-ink-muted hover:text-ink">
            Methodology
          </Link>
        </footer>
      </div>
    </div>
  );
}
