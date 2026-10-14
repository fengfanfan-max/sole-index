/**
 * Deployment reality checks.
 *
 * The application runs against an embedded PostgreSQL (PGlite). On a platform
 * whose function filesystem is read-only, the data directory has to live in the
 * ephemeral scratch space, which means the database is rebuilt from the committed
 * snapshot on every cold start. Reads are unaffected; writes do not survive.
 *
 * Detecting that condition lets the admin surfaces say so, instead of letting an
 * analyst conclude that the tool lost their note.
 */

/** True when the data directory is in scratch space and will not persist. */
export function isEphemeralDatabase(): boolean {
  const dir = process.env.SOLEINDEX_DATA_DIR ?? '.data';
  return dir.startsWith('/tmp') || dir.startsWith('/var/tmp') || dir.startsWith('/dev/shm');
}

/** True when a real PostgreSQL server is configured rather than embedded PGlite. */
export function isServerDatabase(): boolean {
  return (process.env.SOLEINDEX_DB_DRIVER ?? 'pglite').toLowerCase() === 'postgres';
}

/** Human-readable description of where the data currently lives. */
export function describeStorage(): string {
  if (isServerDatabase()) return 'managed PostgreSQL';
  return isEphemeralDatabase() ? 'ephemeral embedded PostgreSQL' : 'local embedded PostgreSQL';
}
