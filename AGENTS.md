<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Multi-Agent Workflow

- Organize work by feature branch, not by tool. Cursor and Claude Code should usually collaborate on the same branch for the same product change.
- Use the `cursor/` branch prefix when a Cursor-initiated workflow requests it, but do not create a separate branch just because a different AI tool is taking over.
- Before switching between AI tools, commit or stash in-progress changes so the next tool starts from a clear working tree.
- Avoid having multiple tools edit the same files at the same time. If work diverges or competing approaches are needed, create separate clearly named branches.
- Keep commits focused and exclude unrelated local changes.

## Environments

- **Prod** = `main` branch + prod Vercel + prod Lambda + prod RDS.
- **Beta** = `beta` branch + beta domain + beta Lambda + beta RDS. Merge here before prod.
- Local scripts should target **beta** DB (see `docs/ops/environments.md`). Use `ALLOW_PROD_DB=true` only when intentionally touching prod.
- Frontend API URL: `NEXT_PUBLIC_VENDOR_API_URL` (see `app/lib/api.ts`).
