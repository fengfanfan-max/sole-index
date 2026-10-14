/**
 * Typed raw-SQL execution.
 *
 * Drizzle constrains the row type of `execute` to `Record<string, unknown>`, so a
 * domain interface — which deliberately has no index signature — cannot be used
 * directly. Rather than adding `& Record<string, unknown>` at two dozen call
 * sites, the cast lives here once, with a comment explaining why it is safe:
 * the SQL is hand-written and the row shape is asserted by the caller, so the
 * only thing being bypassed is Drizzle's inability to infer a shape it cannot
 * see.
 */
import type { SQL } from 'drizzle-orm';

import { getDb, type Db } from '@/db/client';

export async function execute<T>(
  db: Db,
  statement: SQL,
): Promise<{ rows: T[] }> {
  return (await db.execute(statement)) as unknown as { rows: T[] };
}

/** Convenience overload that resolves the connection itself. */
export async function query<T>(statement: SQL): Promise<T[]> {
  const db = await getDb();
  return (await execute<T>(db, statement)).rows;
}
