const { Pool } = require("pg");
const { loadEnv } = require("./load-env");

function isProdDatabaseHost(host) {
  return /prod/i.test(host || "");
}

function assertDatabaseAccessAllowed() {
  const host = (process.env.DB_HOST || "").trim();
  if (!host) return;

  if (isProdDatabaseHost(host) && process.env.ALLOW_PROD_DB !== "true") {
    throw new Error(
      `Refusing to connect to production database (${host}). ` +
        "Point DB_HOST at beta for local work, or set ALLOW_PROD_DB=true intentionally.",
    );
  }
}

function createPool(overrides = {}) {
  loadEnv();
  assertDatabaseAccessAllowed();

  const host = (process.env.DB_HOST || "").trim();
  if (!host || !process.env.DB_NAME) {
    throw new Error("Missing DB_HOST or DB_NAME. Copy .env.example → .env.local.");
  }

  return new Pool({
    host,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 1,
    ...overrides,
  });
}

module.exports = { createPool, assertDatabaseAccessAllowed, isProdDatabaseHost };
