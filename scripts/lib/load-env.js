const fs = require("fs");
const path = require("path");

/**
 * Load env files for local scripts.
 *
 * Set WEDDING_APP_ENV=beta|prod to prefer .env.beta / .env.prod.
 * Falls back to .env.local, then default dotenv behavior.
 */
function loadEnv() {
  const envName = (process.env.WEDDING_APP_ENV || "local").toLowerCase();

  const candidates = [
    process.env.DOTENV_CONFIG_PATH,
    envName === "prod" ? ".env.prod" : null,
    envName === "beta" ? ".env.beta" : null,
    ".env.local",
  ].filter(Boolean);

  for (const rel of candidates) {
    const abs = path.resolve(process.cwd(), rel);
    if (fs.existsSync(abs)) {
      require("dotenv").config({ path: abs });
      return { env: envName, path: rel };
    }
  }

  require("dotenv").config();
  return { env: envName, path: null };
}

module.exports = { loadEnv };
