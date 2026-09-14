/**
 * `inputHash` = sha256 of `schema_version \n prompt_version \n model \n` + the crawled snapshot
 * sha256s, sorted lexicographically, joined by `\n`. Independent of traversal/score order — the
 * document builder is deterministic given the *set* of snapshots, so the same hash always yields
 * the same prompt. Used for `venue_details_runs`' partial unique index (account_id, input_hash).
 */

import { createHash } from "node:crypto";

export interface InputHashParams {
  schemaVersion: number;
  promptVersion: string;
  model: string;
  snapshotShas: string[];
}

export function inputHash(params: InputHashParams): string {
  const sortedShas = [...params.snapshotShas].sort();
  const payload = `${params.schemaVersion}\n${params.promptVersion}\n${params.model}\n${sortedShas.join("\n")}`;
  return createHash("sha256").update(payload).digest("hex");
}
