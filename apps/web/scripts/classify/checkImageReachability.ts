/**
 * Gate check before building the human-labeling UI's image handling: how
 * much of staging.instagram_posts.image_url is actually still reachable?
 * These are raw Instagram CDN URLs captured at scrape time — no durable
 * copy of any post image exists anywhere in this repo (unlike account
 * avatars, which went to R2 per D007) — and IG CDN URLs are commonly
 * signed/time-limited, so an unknown fraction may already be dead.
 *
 * Fetches a random sample directly against the CDN (same allowlisted hosts,
 * spoofed UA + Referer the /api/instagram-image proxy route uses) rather
 * than through the Next dev server, so this can run standalone without
 * `bun run dev` up. Reports a live/dead rate to decide whether the
 * proxy-first image strategy (see the plan) is viable as-is.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/checkImageReachability.ts --sample 200
 */
import { getPool, closePool } from "./db";

const ALLOWED_HOSTS = ["cdninstagram.com", "fbcdn.net"];

function isAllowedInstagramUrl(raw: string): boolean {
  try {
    const { hostname, protocol } = new URL(raw);
    if (protocol !== "https:") return false;
    return ALLOWED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return { sample: Number(get("--sample") ?? 200) };
}

async function checkOne(url: string): Promise<{ ok: boolean; status: number | null; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.instagram.com/",
      },
    });
    // Drain the body so the connection is freed promptly, but don't bother
    // buffering it — we only care about status here.
    await res.body?.cancel();
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  const { rows } = await pool.query<{ post_url: string; image_url: string }>(
    `select post_url, image_url
     from staging.instagram_posts
     where image_url is not null
     order by random()
     limit $1`,
    [args.sample]
  );

  console.log(`[image-reachability] sampled ${rows.length} posts with a non-null image_url`);

  const notAllowedHost: string[] = [];
  const candidates = rows.filter((r) => {
    if (!isAllowedInstagramUrl(r.image_url)) {
      notAllowedHost.push(r.image_url);
      return false;
    }
    return true;
  });
  if (notAllowedHost.length) {
    console.log(
      `[image-reachability] ${notAllowedHost.length} sampled URLs are NOT on an allowlisted host ` +
        `(${ALLOWED_HOSTS.join(", ")}) — the /api/instagram-image proxy would reject these outright. Examples:`
    );
    for (const u of notAllowedHost.slice(0, 3)) console.log(`  ${u}`);
  }

  let ok = 0;
  let failed = 0;
  const statusCounts = new Map<string, number>();
  const failedExamples: string[] = [];

  // Sequential, deliberately — this is a one-off diagnostic, not a
  // throughput-sensitive job, and avoids hammering Instagram's CDN with a
  // burst of concurrent requests from one IP.
  for (const r of candidates) {
    const result = await checkOne(r.image_url);
    const key = result.status !== null ? String(result.status) : `error:${result.error}`;
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
    if (result.ok) {
      ok++;
    } else {
      failed++;
      if (failedExamples.length < 5) {
        failedExamples.push(`${r.post_url} -> ${key}`);
      }
    }
  }

  const total = candidates.length;
  const pct = total ? ((ok / total) * 100).toFixed(1) : "0.0";
  console.log(`\n[image-reachability] ${ok}/${total} reachable (${pct}%), ${failed} failed`);
  console.log("[image-reachability] status breakdown:");
  for (const [status, n] of [...statusCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status}: ${n}`);
  }
  if (failedExamples.length) {
    console.log("[image-reachability] failure examples:");
    for (const ex of failedExamples) console.log(`  ${ex}`);
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
