'use server';

/**
 * Session server actions.
 *
 * `redirect()` is called outside any try/catch on purpose — it throws a control
 * signal that a catch block would swallow.
 */
import { redirect } from 'next/navigation';

import { clearSession, DEMO_USERS, setSession } from './session';

export async function signInAs(formData: FormData): Promise<void> {
  const userId = String(formData.get('userId') ?? '');
  const persona = DEMO_USERS.find((u) => u.userId === userId);
  if (!persona) redirect('/login?error=unknown-persona');

  await setSession(persona);
  const next = String(formData.get('next') ?? '/');
  redirect(next.startsWith('/') ? next : '/');
}

export async function signOut(): Promise<void> {
  await clearSession();
  redirect('/login');
}
