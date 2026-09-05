# Changelog

All notable changes to `@datum-cloud/opencode-plugins` are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); this project
adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-27

### Added

- Initial port from [`datum-cloud/claude-code-plugins`](https://github.com/datum-cloud/claude-code-plugins) to OpenCode.
- **13 agents** (datum-platform: 7; datum-gtm: 4; milo-activity: 2) as opencode subagents. The source `datum-platform/plan` agent is dropped in favor of OpenCode's built-in `plan` primary.
- **41 skills** (datum-platform: 31; datum-gtm: 4; milo-activity: 7; the shared `discover` skill deduplicated to one). 1:1 copies with frontmatter validated against the opencode name regex.
- **9 commands** (datum-platform: 8; datum-gtm: 1), filenames namespaced (`platform-*`, `gtm-*`) to resolve the `discover` collision. (milo-activity has no commands in the source.)
- **`auto-validate`** TypeScript hook plugin (`src/auto-validate.ts`) porting the source `hooks/hooks.json` + `scripts/auto-validate.sh` to OpenCode's `tool.execute.after` event; dispatches to the unchanged per-skill validator scripts. Warn-only (non-blocking), matching source behavior.
- `postinstall.mjs` copies bundled markdown into `~/.config/opencode/` idempotently (plannotator pattern).
- `docs/porting-guide.md` and `docs/troubleshooting.md`.

## [1.1.0] - 2026-09-05

### Added

- New **`clear-writing`** skill (datum-platform) — rules for prose a busy reader understands on the first pass, including the enforced phrase table consumed by the `pr-op-gate` hook.
- **`pr-op-gate`** hook (blocking): shipped the unchanged `scripts/pr-op-gate` and wired it via a `tool.execute.before` handler in `src/auto-validate.ts`. It measures `gh pr|issue create|edit` bodies against the countable rules and throws (blocks) on violation, logs advisory context otherwise. The plugin passes `CLAUDE_PLUGIN_ROOT` so the script resolves `skills/clear-writing/SKILL.md`.

### Changed

- **`pr-conventions`** skill — synced upstream rewrite (countable bar for GitHub bodies, tag/formatting rules).
- **`commit-conventions`** skill — synced upstream updates.
- **`tech-writer`** agent — added "read the `clear-writing` skill" workflow step.
- `postinstall.mjs` now also installs `scripts/`; repository docs counts updated (42 skills total, two hooks).

### Notes

- The source `claude-code-plugins` was brought to `origin/main` (18 new commits) before porting this round.
