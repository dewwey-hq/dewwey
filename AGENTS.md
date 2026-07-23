<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Start Here (read before starting work)

This repo is the single source of truth for engineering AND business/strategy — not just code.

1. `docs/README.md` — index of everything below
2. `ROADMAP.md` — what's actively being worked on, before picking up any thread
3. `docs/decisions.md` — skim the top 5-10 entries
4. The specific `docs/product/` or `docs/engineering/` doc for the task at hand
5. If touching env/deploys/DB: `docs/engineering/environments.md` and `docs/engineering/scaling.md`

If you make a decision that would be expensive to re-derive later, add it to `docs/decisions.md` before ending the session. If you start or advance a feature, use `docs/product/TEMPLATE.md` and update its status in `ROADMAP.md`. **Check ROADMAP's "Now" section before starting a thread** — two sessions colliding on the same in-flight work (e.g. beta environment setup) is exactly what this is meant to prevent.

## Multi-Agent Workflow

- Organize work by feature branch, not by tool. Cursor and Claude Code should usually collaborate on the same branch for the same product change.
- Use the `cursor/` branch prefix when a Cursor-initiated workflow requests it, but do not create a separate branch just because a different AI tool is taking over.
- Before switching between AI tools, commit or stash in-progress changes so the next tool starts from a clear working tree.
- Avoid having multiple tools edit the same files at the same time. If work diverges or competing approaches are needed, create separate clearly named branches.
- Keep commits focused and exclude unrelated local changes.
- Changes to `main` and `beta` go through a PR — push a branch, open a PR, let CI run, then merge. This is convention, not enforced (branch protection needs GitHub Pro on a private repo, which this isn't on) — treat it as required anyway.

## Environments

- **Prod** = `main` branch + prod Vercel + prod Lambda + prod RDS.
- **Beta** = `beta` branch + beta domain + beta Lambda + beta RDS. Merge here before prod.
- Local scripts should target **beta** DB (see `docs/engineering/environments.md`). Use `ALLOW_PROD_DB=true` only when intentionally touching prod.
- Frontend API URL: `NEXT_PUBLIC_VENDOR_API_URL` (see `app/lib/api.ts`).
