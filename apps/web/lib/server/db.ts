import { Pool } from "pg";

// One pool per server instance, reused across requests. Supabase's pooler
// (Supavisor) multiplexes these, so no RDS-Proxy-style connection math needed.
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}
