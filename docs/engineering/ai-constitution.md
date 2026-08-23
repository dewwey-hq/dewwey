# AI Constitution

## TLDR

Standing rules for any AI tool (or human) working in this repo, on top of what's already in `AGENTS.md`. Every rule below is tagged:

- **[enforced]** — a tool actually stops the violation today (CI, `.gitignore`, a script guard, a DB grant)
- **[partial]** — some real technical mechanism exists, but it doesn't cover the whole rule — read the note, don't assume the gap is closed
- **[norm]** — policy only; nothing technical stops it, everyone (human or AI) is expected to follow it anyway
- **[future]** — not applicable yet because the feature it protects doesn't exist; required *before* that feature ships

Don't trust a `[future]` rule to be protecting anything today — it's a placeholder for a decision already made, not a description of current behavior. When you close one of these gaps, flip its tag and note it in `docs/decisions.md`.

This doc supplements `AGENTS.md`, it doesn't replace it — still read `AGENTS.md`'s "Start Here" list first.

---

## Principles

The specific rules below all fall out of a few things:

- **Least privilege.** Never hold a credential broader than the task needs — beta before prod, read-only before read-write. `app_readonly` (D005) is the running example; apply the same instinct to CLI access, CloudWatch, anything scoped by credential.
- **No security theater.** Don't add a security mechanism because it's conventional. Every control needs an identified threat, an enforcement point, and — where practical — a test. The RLS guidance below is the concrete case: writing `CREATE POLICY` before an ownership/auth model exists would protect nothing.
- **Architecture is a constraint, not a suggestion.** The stack below is a deliberate choice. Don't swap in a different ORM, database, or backend framework because it's more familiar from training data — that's an architecture change, and needs a human decision plus a `docs/decisions.md` entry, not a drive-by PR.
- **Don't claim a check you didn't run.** If lint/tests/build didn't run, or something was blocked or out of reach, say so explicitly instead of reporting the task as done — see Definition of Done.

## Architecture

- This is **Next.js 16 on Vercel + AWS Lambda/API Gateway + RDS Postgres via raw `pg`** — no Supabase, no Prisma/ORM, no serverless functions framework beyond Next's own API routes. Don't reach for APIs or patterns from those stacks; if training data suggests one, check `node_modules/next/dist/docs/` and this repo's actual code first, same principle `AGENTS.md` already states for Next.js itself. **[norm]**
- Never introduce a new backend service, database, or ORM (Prisma, Drizzle, Supabase, etc.) without discussing it first — log the decision in `docs/decisions.md` even if it's a "yes." Two databases or two backend frameworks is a much bigger tax on this codebase than it looks like from inside one PR. **[norm]**
- Frontend and API routes deploy as one Vercel project; environment is selected entirely by env vars (see `environments.md`), not by branching logic in code. Don't add `if (env === 'prod')` special-casing in app code — put environment differences in config/env vars. **[norm]**

## Security

- Real secrets in this repo: `DB_PASSWORD`, `GEMINI_API_KEY`, `APIFY_API_TOKEN`, `GOOGLE_APPLICATION_CREDENTIALS` (a service-account JSON file), `GOOGLE_PLACES_SERVER_API_KEY`, `BETA_ACCESS_PASSWORD`. None of these may appear in source, in a committed file, in logs, or in a chat/PR transcript. **[partial]** — `.gitignore` stops the known secret-file patterns (`.env*`, `*-key.json`, `secrets/`) from being committed; verified none are currently tracked. It does not catch a secret typed directly into a tracked source file — that still relies on review (see AI Code Review).
- Anything in a `NEXT_PUBLIC_*` env var ships to every browser. That's the real version of "don't expose secrets to the client" for this stack — there is no separate server-only key concept like a Supabase service-role key. Before adding a new `NEXT_PUBLIC_*` var, confirm it's genuinely safe to be public (the existing ones are Google Maps/Places browser keys, which are designed for this and locked down by HTTP-referrer restriction, not by secrecy). **[norm]**
- Validate all API route inputs with `zod` before using them. **[future]** — not yet adopted anywhere; retrofit the 3 existing routes (`beta-access`, `venue-photo`, `instagram-image`) as they're next touched, and require it on any new route from here on.
- Never trust a client-supplied user/wedding/owner ID to scope a query. **[future]** — there's no user-account model yet, so nothing is scoped by ID today; this becomes a hard requirement the moment any per-account data ships (see Database → RLS below).
- Don't log PII, and don't send more personal data to an LLM than the task needs. The one place this already matters: Instagram scraping (`instagram_posts` — usernames, mentions, captions) and the venue-enrichment Gemini calls. Don't log raw scrape payloads, and don't widen what gets sent to Gemini beyond what the extraction task requires without a specific reason. **[norm]**

## Database

- All schema changes go through a numbered migration in `scripts/migrations/`, run beta-first-then-prod, using `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS` so they're backwards compatible and safe to re-run. Never edit a migration that's already been run — write a new one. **[norm]** — see `scripts/migrations/README.md`; nothing technically stops a manual `ALTER TABLE` or a hand-edited migration file, this is the house pattern only.
- Never manually modify the prod database (`ALTER`/`UPDATE`/`DELETE` run ad hoc, outside a migration file). **[partial]** — `scripts/lib/db.js` refuses to connect to any host matching `prod` unless `ALLOW_PROD_DB=true` is set explicitly, but only for scripts that go through `createPool()`. It does **not** cover the documented migration workflow itself, which runs raw `psql` directly against the host (see `environments.md`) — that path has no technical gate at all, only the operator typing the right host and password. Prefer `createPool()` for new Node scripts; treat a raw `psql` connection to a prod host as inherently unguarded, gate it with judgment instead.
- The app connects with least privilege: the read-only Lambda path uses `app_readonly` (`SELECT`-only, `NOSUPERUSER`, `NOBYPASSRLS`), not the `postgres` superuser. Migration/admin scripts still use `postgres` because they need to alter schema. **[enforced]** — done on both beta and prod 2026-08-11, see D005.
- Row-level security. **[future]** — there is no auth system and no per-user ownership column anywhere in the schema today; every table here is public directory data (vendors, venues, wedding stories). RLS policies would currently protect nothing. It becomes required *before* any feature ships where an account owns rows (e.g., a couple's saved venues, guests, budget, or planning data), and needs, in order: (1) an ownership column added via migration, (2) an auth/session layer, (3) the app's DB role confirmed `NOBYPASSRLS` (already true for `app_readonly` going forward), (4) `CREATE POLICY` per table keyed off a per-request session variable. Do not write `CREATE POLICY` statements as security theater before steps 1–3 exist — they'd be inert. Any feature that reads or writes user-owned data must identify its authorization boundary in the PR description and include a test proving User A cannot access User B's data — required from the moment ownership exists, not treated as a follow-up.

## AI-assisted development workflow

- AI-generated code needs tests for anything with real logic (parsing, validation, guards, business rules) — not for trivial JSX/layout. Run `npm test` (Vitest) locally before opening a PR. **[partial]** — CI (`npm test` in `.github/workflows/ci.yml`) enforces that whatever tests exist must pass; it does not enforce that new logic actually gets a new test. That half is an agent self-check — see Definition of Done.
- Validate LLM outputs before they're written to the DB. Concrete case that exists today: `scripts/venue-enrichment/llm-schema-gemini.js`'s Gemini extraction results should be checked (via `zod`, once adopted — see Security) before landing in `venue_enrichment`/`venue_extraction_runs`. A model's own structured-output schema constrains what it *tries* to return; it doesn't guarantee what you actually got. **[future]** — pending zod adoption.
- Use structured/JSON-schema outputs for extraction tasks — already the house pattern in `llm-schema.js`/`llm-schema-gemini.js`. Keep doing it. **[norm, already practiced]**
- Follow `AGENTS.md`'s Multi-Agent Workflow section: one feature branch per product change regardless of which AI tool is driving, commit or stash before handing off between tools, don't have two tools editing the same files concurrently. **[norm]**
- A decision that would be expensive to re-derive (a workaround, a non-obvious tradeoff, "we tried X and it broke because Y") goes in `docs/decisions.md` before the session ends. This constitution is itself maintained the same way — update a rule's tag here when its enforcement status actually changes, don't let it drift out of sync with the code.

## Definition of Done

Before reporting a task complete, an AI agent should:

1. Run `npm run lint` and `npm run typecheck`.
2. Run `npm test` (Vitest) — and if the change adds real logic (parsing, validation, guards, business rules), add a test for it, don't just leave existing tests green.
3. Run `npm run build` if the change touches anything Next.js compiles (routes, components, config).
4. Run relevant end-to-end tests when the change affects a user flow. **[future]** — there is no Playwright/e2e suite yet (see `ROADMAP.md`); until one exists, say so instead of silently skipping the step.
5. Read the actual `git diff` for anything unintended — a stray debug line, an unrelated file, a leftover local change.
6. Confirm nothing in the diff is a secret, credential, or personal data (see Security).
7. If the DB schema changed, confirm a new numbered migration exists in `scripts/migrations/` — not a hand-edit.
8. If an API route changed, confirm input validation exists for it (`zod`, once adopted — until then, at minimum confirm untrusted input can't reach the DB unchecked).
9. If the change touches auth or ownership once that exists, name the authorization boundary explicitly and point to the test proving User A can't reach User B's data (see Database → RLS).
10. **If a check above genuinely couldn't be run — no access, blocked, out of scope — report that explicitly rather than claiming the task is done.** This session is the concrete case: AWS CLI access got blocked mid-task by the permission classifier, and that was reported as a blocker needing the user's own terminal, not worked around or glossed over.

## AI Code Review

AI review — whether that's this document, an agent reviewing a diff, or a future automated reviewer — is **advisory unless a specific check is wired up as a blocking CI gate**. It does not replace human review, and a green CI run is not the same as security correctness; don't approve something solely because CI passed.

Scope review to the PR diff plus the code it actually touches, not the whole repo. Specifically look for:

- authentication/authorization bypasses and cross-account data access (relevant once user-owned data exists — see Database → RLS)
- SQL injection or unsafe query construction — this app uses raw `pg`, not an ORM, so nothing is catching this for you structurally
- secrets or credentials in the diff
- missing input validation on API routes
- unvalidated LLM output landing in the DB (the venue-enrichment Gemini calls are the concrete case today)
- prompt injection or untrusted instructions arriving via scraped content (Instagram captions, venue websites) that later gets fed into an LLM call
- unbounded or unexpectedly expensive third-party calls (Apify, Gemini, Google Places/Maps are all metered)
- new infrastructure, services, or paid resources introduced without a decision recorded (see Architecture, Principles)
- a migration that isn't backwards-compatible, or a manual prod edit outside a migration
- meaningful business logic shipped with no test

Rank findings critical / high / medium / low. Critical security or data-isolation findings should be capable of blocking a merge once there's an actual technical gate for it — there isn't yet (see Deployment) — so until then, treat a critical finding as "do not merge without a human reading this," not as an automatic block.

## Deployment

- Feature branches → PR → `beta` → validate on `beta.dewwey.com` → PR → `main` → prod. No direct pushes to `main`/`beta` for anything beyond trivial doc fixes. **[norm]** — GitHub branch protection requires a paid plan on this private repo (checked: currently 403s on the free tier), so nothing technically blocks a direct push. Worth revisiting if this stops being a one-person repo.
- CI must be green before merge: lint, typecheck, test, build. **[partial]** — the checks themselves run automatically on every PR/push (`.github/workflows/ci.yml`) and are real. Whether a red CI actually *blocks* a merge is not enforced — same branch-protection gap as the row above.
- Code promotion is a merge; data promotion is manual (migrations and batch jobs run beta-then-prod by hand). Don't assume merging a branch moves any database rows. **[norm]** — see `environments.md`.
- No prod deploys, prod deletes, prod secret access, or billing-affecting changes (upgrading AWS/Vercel/Apify/Google Cloud tiers, provisioning new paid resources) without an explicit human go-ahead in the moment — a prior approval for one action doesn't carry over to the next one. **[norm]**, backed partly by **[partial]** on the DB side (`ALLOW_PROD_DB` gate — see Database).

## What an AI agent may do without asking first

Use the narrowest credential the task needs — beta before prod, read-only before read-write (see Principles).

**Read:** source code, docs (`docs/`, `AGENTS.md`, `ROADMAP.md`, `decisions.md`), the DB schema (migration files — not connecting to prod directly), tests, CloudWatch logs (read-only).

**Write:** feature branches, tests, new numbered migration files (never edit a past one), doc updates (`decisions.md`, `ROADMAP.md`, per `AGENTS.md`'s own convention).

**Never without asking first, even mid-session:** destructive prod DB operations (deletes, drops, manual edits outside a migration); committing or otherwise exposing any secret; a prod deploy or `main` push outside the PR flow; anything that spends real money (new paid resources, plan upgrades); force-push or history rewrite on `main`/`beta`; weakening a CI check or the `ALLOW_PROD_DB` guard itself.
