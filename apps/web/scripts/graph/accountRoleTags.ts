/**
 * Pure helpers for refreshAccountRoleTagsFromWeddings.ts -- split out so
 * accountRoleTags.test.ts can exercise the tag-confidence formula and the
 * top-role diff classifier without a DB (same split as venueAliasSignals.ts /
 * venueAliasSignals.test.ts).
 *
 * Why this script exists: the D055 wedding batches (2,200+ weddings since
 * 2026-09-08) wrote `wedding_vendors` rows directly and never touched
 * `account_tags`, so `v_account_role` (what `/venues` and `/vendors/<username>`
 * display) went stale relative to the documented weddings -- the 2026-09-10
 * coverage audit found 195 venue-of-704-weddings accounts with no tag at all
 * and 364 accounts showing a stale top role. `weddingCreditConfidence` is the
 * same `least(0.5 + 0.15*count, 0.95)` formula Ben's pipeline already uses for
 * stack-evidence tags (pipeline/schema.sql `account_tags` comment), applied to
 * `count(distinct wedding_id)` per `(account_id, role)` in `wedding_vendors` --
 * "roles are votes across posts" (CLAUDE.md), and a documented wedding is the
 * strongest vote there is.
 */

export function weddingCreditConfidence(evidenceCount: number): number {
  return Math.min(0.5 + 0.15 * evidenceCount, 0.95);
}

export interface RoleVote {
  accountId: number;
  role: string;
  source: string;
  confidence: number;
  evidenceCount: number;
}

export interface TopRole {
  accountId: number;
  role: string;
  confidence: number;
  evidenceCount: number;
}

/**
 * Mirrors `v_account_role`:
 *   select distinct on (account_id) account_id, role, confidence, evidence_count
 *   from account_tags order by account_id, evidence_count desc, confidence desc
 * Ties beyond evidence_count/confidence are broken by role name ascending purely for
 * deterministic report/test output -- Postgres itself doesn't guarantee an order among
 * exact ties on both columns, but two sources landing on the identical (evidence_count,
 * confidence) pair for the same account is rare in practice.
 */
export function pickTopRoles(rows: RoleVote[]): Map<number, TopRole> {
  const byAccount = new Map<number, RoleVote[]>();
  for (const r of rows) {
    const list = byAccount.get(r.accountId);
    if (list) list.push(r);
    else byAccount.set(r.accountId, [r]);
  }
  const result = new Map<number, TopRole>();
  for (const [accountId, list] of byAccount) {
    const top = [...list].sort(
      (a, b) =>
        b.evidenceCount - a.evidenceCount ||
        b.confidence - a.confidence ||
        a.role.localeCompare(b.role)
    )[0];
    result.set(accountId, {
      accountId,
      role: top.role,
      confidence: top.confidence,
      evidenceCount: top.evidenceCount,
    });
  }
  return result;
}

export interface TopRoleChange {
  accountId: number;
  wasRole: string;
  wasEvidence: number;
  becomesRole: string;
  becomesEvidence: number;
}

/**
 * Accounts present in BOTH `before` and `after` whose top role differs. Accounts with no
 * `before` entry (brand-new tags -- an account that had zero account_tags rows at all) are
 * NOT a "change": there's nothing to compare against. The caller reports those separately
 * as "newly tagged" accounts.
 */
export function diffTopRoles(
  before: Map<number, TopRole>,
  after: Map<number, TopRole>
): TopRoleChange[] {
  const changes: TopRoleChange[] = [];
  for (const [accountId, afterTop] of after) {
    const beforeTop = before.get(accountId);
    if (!beforeTop) continue;
    if (beforeTop.role !== afterTop.role) {
      changes.push({
        accountId,
        wasRole: beforeTop.role,
        wasEvidence: beforeTop.evidenceCount,
        becomesRole: afterTop.role,
        becomesEvidence: afterTop.evidenceCount,
      });
    }
  }
  return changes;
}
