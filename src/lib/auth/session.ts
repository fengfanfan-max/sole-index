/**
 * Demo session handling.
 *
 * This is deliberately **not** a full auth provider. The brief asks for an admin
 * surface behind a role check and an architecture that can carry premium
 * subscriptions; wiring in OAuth would add a credential dependency to the demo
 * without demonstrating either of those things.
 *
 * So: a signed cookie carrying a role and a tier, with the same surface a real
 * provider would expose (`getSession`, `requireRole`, tier checks). Swapping in
 * Auth.js means replacing this one module — the call sites do not change, and
 * the swap is described in docs/architecture.md.
 *
 * The signature is a real HMAC. A visitor cannot escalate their own tier by
 * editing the cookie, which matters because the paywall demo has to be a genuine
 * server-side gate to be worth showing.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

export type UserRole = 'admin' | 'editor' | 'viewer';
export type UserTier = 'free' | 'pro' | 'enterprise';

export interface Session {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  tier: UserTier;
  /** Initials for the avatar chip. */
  initials: string;
}

const COOKIE_NAME = 'si_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const TIER_RANK: Record<UserTier, number> = { free: 0, pro: 1, enterprise: 2 };
const ROLE_RANK: Record<UserRole, number> = { viewer: 0, editor: 1, admin: 2 };

/**
 * The three personas available from /login. They map onto the three rows seeded
 * into `users`, so switching persona changes what the *database* says too.
 */
export const DEMO_USERS: readonly Session[] = [
  {
    userId: 'u-fanfan',
    name: 'Fanfan Feng',
    email: 'analyst@soleindex.dev',
    role: 'admin',
    tier: 'enterprise',
    initials: 'FF',
  },
  {
    userId: 'u-editor',
    name: 'Mira Okafor',
    email: 'editor@soleindex.dev',
    role: 'editor',
    tier: 'pro',
    initials: 'MO',
  },
  {
    userId: 'u-viewer',
    name: 'Demo Viewer',
    email: 'viewer@soleindex.dev',
    role: 'viewer',
    tier: 'free',
    initials: 'DV',
  },
];

/**
 * Default persona when **no cookie is present at all**.
 *
 * The demo defaults to the admin so a first-time visitor sees the whole product
 * rather than a paywall. Locked states are still reachable in one click from the
 * persona switcher, which is how the gating gets demonstrated instead of
 * described.
 */
export const DEFAULT_SESSION: Session = DEMO_USERS[0]!;

/**
 * Persona used when a cookie **is** present but does not verify.
 *
 * This must be the least privileged persona, not the most. An earlier version
 * fell back to `DEFAULT_SESSION` here as well, which made the security property
 * unobservable: "the signature check rejected this session" and "the server
 * granted everything" produced identical responses, so a broken or absent check
 * would never have been noticed. Falling back to the viewer keeps the two cases
 * distinguishable, and means a tampered cookie earns the fewest rights rather
 * than the most.
 */
export const ANONYMOUS_SESSION: Session = DEMO_USERS[2]!;

function secret(): string {
  return process.env.SOLEINDEX_SESSION_SECRET ?? 'dev-only-insecure-secret-change-me';
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function encode(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decode(raw: string): Session | null {
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    if (!parsed?.userId || !parsed?.role || !parsed?.tier) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Reads the current persona. Never throws. */
export async function getSession(): Promise<Session> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;

  // No cookie: a first-time visitor gets the demo's most useful view.
  if (!raw) return DEFAULT_SESSION;

  // Cookie present but unverifiable: reject to least privilege.
  return decode(raw) ?? ANONYMOUS_SESSION;
}

/** Writes the persona cookie. Only callable from a Server Action or Route Handler. */
export async function setSession(session: Session): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, encode(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/* -------------------------------------------------------------------------- */
/* Authorisation helpers                                                       */
/* -------------------------------------------------------------------------- */

export function hasTier(session: Session, minimum: UserTier): boolean {
  return TIER_RANK[session.tier] >= TIER_RANK[minimum];
}

export function hasRole(session: Session, minimum: UserRole): boolean {
  return ROLE_RANK[session.role] >= ROLE_RANK[minimum];
}

export function canWriteContent(session: Session): boolean {
  return hasRole(session, 'editor');
}

/**
 * Guard for admin surfaces. Returns the session when authorised, `null` when
 * not — callers render a locked state rather than throwing, so the demo can show
 * *what* is gated instead of a 403.
 */
export async function requireRole(minimum: UserRole): Promise<Session | null> {
  const session = await getSession();
  return hasRole(session, minimum) ? session : null;
}

export const TIER_LABELS: Record<UserTier, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  editor: 'Editor',
  viewer: 'Viewer',
};
