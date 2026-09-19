/**
 * R2 snapshot text storage via Bun's built-in S3 client (`Bun.S3Client` — no `aws-sdk`/`@aws-sdk`
 * dependency; Bun has S3 support natively). Uses the existing `R2_*` env vars (D007: the DB
 * stores R2 keys, never URLs). Key layout: `venue-sources/<account_id>/<sha256>.txt`.
 *
 * Never logs the access/secret key — only key names and byte counts.
 */

function client(): Bun.S3Client {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accessKeyId || !secretAccessKey || !bucket || !accountId) {
    throw new Error(
      "R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_ACCOUNT_ID must be set (see .env.local) -- run from apps/web so Bun loads it."
    );
  }
  return new Bun.S3Client({
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  });
}

/** account_id + sha256 -> the R2 key snapshots are stored under. Pure, no I/O. */
export function snapshotKey(accountId: number, sha256: string): string {
  return `venue-sources/${accountId}/${sha256}.txt`;
}

export async function putSnapshotText(key: string, text: string): Promise<void> {
  await client().file(key).write(text, { type: "text/plain; charset=utf-8" });
}

export async function getSnapshotText(key: string): Promise<string> {
  return client().file(key).text();
}

/**
 * Generic byte-blob writer (D061 acquisition loop) -- posts/avatars images land at
 * `posts/<shortcode>/<idx>.jpg` / `avatars/<username>.jpg` (D007: keys, never URLs).
 * Distinct from putSnapshotText because images are binary + carry their own content-type,
 * not always text/plain.
 */
export async function putBytes(
  key: string,
  bytes: Uint8Array | ArrayBuffer,
  contentType: string
): Promise<void> {
  await client().file(key).write(bytes, { type: contentType });
}
