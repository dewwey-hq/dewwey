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
