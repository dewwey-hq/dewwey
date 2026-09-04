/**
 * DB connection for the classification scripts. Run these from apps/web
 * (`bun run scripts/classify/<script>.ts`) so Bun auto-loads .env.local —
 * same DATABASE_URL the app uses (Supabase). Set LOCAL_PG=1 to point at the
 * docker-compose rehearsal DB in pipeline/ instead.
 */
import { Pool } from "pg";

const LOCAL_CONNECTION_STRING =
  "postgres://dewwey:dewwey@localhost:5442/dewwey";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.LOCAL_PG
      ? LOCAL_CONNECTION_STRING
      : process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set — run scripts from apps/web so Bun loads .env.local"
      );
    }
    pool = new Pool({ connectionString, max: 8 });
  }
  return pool;
}

export async function closePool() {
  if (pool) await pool.end();
}
