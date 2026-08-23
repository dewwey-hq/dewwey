# Shared agent skills

Committed, repo-scoped skills in Anthropic's SKILL.md format — one folder per
skill: `.claude/skills/<name>/SKILL.md` (frontmatter: name + description that
tells the agent when to trigger it). Claude Code loads these automatically;
skill installers also target this directory.

Local-only agent state (settings.local.json) stays gitignored.
