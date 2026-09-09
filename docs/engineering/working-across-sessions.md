# Working across sessions and context windows

Written 2026-09-09 at the user's request ("consider how we can improve this whole process of
daily work but different context windows... strategize it in a plan"). This is the plan.

## The problem, stated honestly

Over 2026-09-04 → 09-09 the same mission ran across a dozen context windows. Each hand-off
worked, but by accretion, not design:

- **Status was scattered.** `ROADMAP.md`'s "Now" section, the tail of the latest `decisions.md`
  entry, seven near-duplicate "status" memory files, a "session commit" memory, and the plan file
  each held a partial, differently-dated picture. A resuming session had to read all of them and
  reconcile — and the roadmap was two missions stale by the end.
- **Memory was used as a status board.** The memory system is for durable preferences and
  pointers; it was carrying 15 KB narratives that went stale within a day.
- **Numbers were re-pinned in tests, in prose, and in memory** — three places to drift.
- **Subagents stalled on "waiting for the test run"** twice, each time leaving edits on disk that
  the parent had to discover and verify.
- **Scratch work was unrecoverable.** The batch-pull SQL lived only in a transcript; after
  compaction it had to be dug out of the `.jsonl` with grep.

## The design: one page, three tiers, a fixed session shape

### Three tiers of durable state, each with one job

| Tier | File | Job | Rewritten or appended |
|---|---|---|---|
| **Now** | `docs/STATE.md` | The single current picture: mission, live numbers, blocked-on-user, next actions, landmines, where things live. | **Rewritten** at every session end. Never appended. |
| **History** | `docs/decisions.md` | Why things are the way they are. Cite by ID. | Appended (addenda inside the active entry are fine). |
| **Preferences & pointers** | Claude memory (`~/.claude/projects/.../memory/`) | How the user likes to work, standing rules, and short pointers to the two files above. | Edited in place; one landing-pad memory points at `STATE.md`. |

Everything else (the plan file, ROADMAP "Now", mission READMEs) points at `STATE.md` rather than
restating it. **ROADMAP "Now" is a pointer plus the two or three non-mission threads**, not a
narrative.

### The session shape

**Start (5 minutes, every time):**
1. `docs/STATE.md` — mission, numbers, blocked, next.
2. `git log --oneline -5` and `git status` — verify the page's "last commit" claim.
3. The memory index (loaded automatically); open only the memories STATE.md names.
4. Re-verify one live number before trusting the page (the user's standard: re-check, don't
   recall).

**During:**
- Work in a `/loop` with a defined mission and end state; report only when an artifact lands.
- Every on-behalf or batch write is a **file first**: scratch SQL goes to
  `apps/web/scripts/graph/tmp_analysis/<decision>_<what>.sql` with a header comment (what, why,
  counts), then `psql -f`. Replayable, greppable, survives compaction.
- Pull-queries that will be re-run (the next batch of posts to read) go in the same directory
  as `.sql`, never only in a Bash command.
- Tests are the invariants. When a count drifts, re-pin it **in the test with the reason** — and
  nowhere else in prose except `STATE.md`'s table.
- Subagent contract: "implement, run the suite, paste the summary, return." Never "wait for a
  monitor." Parent reviews the diff before anything runs against the DB.
- Commit at every batch boundary; the commit message is the addendum in short form.

**End (before the user's bedtime, or when the context is long):**
1. `decisions.md` addendum for the day's decisions (not the play-by-play).
2. **Rewrite `docs/STATE.md`** from live numbers.
3. Memory: update the landing-pad pointer; add/edit a preference memory only if the user taught
   something new; never write status into memory.
4. Commit. Say what is and isn't pushed.
5. Stop the loop if nothing can progress without the user (say how to restart it).

### Batch protocol (the part that touches production data)

snapshot → dry-run → user's word → create → verify attachments (every wedding has posts and a
venue credit that matches its venue) → re-pin literals → addendum → commit → rewrite STATE.md.
No exceptions; the two orphan bugs (D050, D055 batch 3) were both caught by the verify step.

### On-behalf review protocol

Only for classes the user has explicitly approved, always under a distinct `reviewed_by` tag,
never into `human_post_labels` (the golden set stays human-only), one replayable SQL file per
batch, ambiguous posts left for the human, counts reported. The user can spot-check any batch by
opening its file.

## What changed tonight to put this in place

- `docs/STATE.md` created and populated from live numbers.
- `ROADMAP.md` "Now" cut to a pointer + the non-mission threads (the D043–D054 narrative it held
  is already in `decisions.md`).
- `docs/README.md` indexes STATE.md, this doc, and the human-labeling review UI.
- Memory: the stale "session commit" landing pad replaced by `session-landing-pad` (points at
  STATE.md); the seven status memories marked historical in the index; a `feedback` memory
  records this protocol as the user's stated preference.
- Batch-pull SQL for the review classes saved under `tmp_analysis/` alongside the verdict files.

## Open improvements (not done tonight)

- A `bun run state` script that prints the STATE.md numbers table from the live DB, so the
  rewrite is a paste, not a hand-copy.
- A pre-commit check that fails if `STATE.md`'s "Last rewritten" date is older than the newest
  `decisions.md` addendum.
- Fold the plan file's "Decisions taken" block into STATE.md so approvals live in the repo, not
  in `~/.claude/plans`.
