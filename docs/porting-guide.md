# Porting Guide: Claude Code → OpenCode

Field-by-field mapping reference used to port `datum-cloud/claude-code-plugins` into this package. Future ports of new skills/agents/commands/hooks should follow these rules.

## High-level model differences

| Concept | Claude Code | OpenCode |
|---------|-------------|----------|
| Distribution | marketplace (`.claude-plugin/marketplace.json`) + per-plugin `plugin.json` | npm package added to `opencode.json` `plugin` array; markdown shipped in `files` and copied via `postinstall` |
| Bundle unit | "plugin" = a directory of agents/skills/commands/hooks | OpenCode "plugin" = a JS/TS *event-hook module* only; agents/skills/commands are discovered separately from `.opencode/` or `~/.config/opencode/` |
| Path variable | `${CLAUDE_PLUGIN_ROOT}` | none — use the `worktree`/`directory` from the plugin context, or `.opencode/skills/<skill>/...` relative paths |
| Instructions file | `CLAUDE.md` | `AGENTS.md` |
| Pipeline artifacts | `.claude/pipeline/` | `.opencode/pipeline/` |

## Skills

**Rule:** 1:1 copy of the directory (`SKILL.md` + topic files + `scripts/`).

Frontmatter:

| Field | Claude Code | OpenCode | Action |
|-------|-------------|----------|--------|
| `name` | required | required, must match dir, regex `^[a-z0-9]+(-[a-z0-9]+)*$` | keep; verify match |
| `description` | required | required, 1–1024 chars | keep; trim if >1024 |
| `license`, `compatibility`, `metadata` | — | optional | add if useful |
| `tools`, `model`, others | various | ignored (unknown frontmatter is dropped silently) | leave in place — harmless |

Discovery paths opencode searches: `.opencode/skills/<name>/SKILL.md`, `~/.config/opencode/skills/<name>/SKILL.md`, and (Claude-compat) `.claude/skills/<name>/SKILL.md`.

## Agents

**Rule:** port to `agents/<name>.md` (filename = agent name). Drop the source `datum-platform/plan.md` agent entirely — OpenCode ships a built-in primary `plan`.

Frontmatter:

| Field | Claude Code | OpenCode | Action |
|-------|-------------|----------|--------|
| `name` | required | not used (filename is the name) | drop |
| `description` | required | required | keep |
| `tools` | `Read, Write, Grep, Glob, Bash` | `tools` deprecated → `permission` | drop; map to `permission` |
| `model` | `sonnet`, `haiku`, ... | `provider/model-id`, e.g. `anthropic/claude-sonnet-4-5` | drop (inherit user's model) |
| `mode` | — | `subagent` / `primary` | add `mode: subagent` for all ported agents |
| `permission` | — | keys: `read`, `edit`, `bash`, `glob`, `grep`, `list`, `task`, `webfetch`, `skill`, ... | add |

`tools` → `permission` mapping:

| Source `tools` | Target `permission` |
|----------------|---------------------|
| `Read, Write, Edit, Grep, Glob, Bash` | `{ edit: "allow", bash: "allow", read: "allow", glob: "allow", grep: "allow" }` |
| `Read, Grep, Glob` (read-only reviewers) | `{ edit: "deny", bash: "deny" }` (read/glob/grep default-allow) |
| `Read, Grep, Glob, Bash` (read + run) | `{ edit: "deny", bash: "allow" }` |

Body rewrites (search/replace):

- `CLAUDE.md` → `AGENTS.md`
- `.claude/pipeline/` → `.opencode/pipeline/`
- `.claude/patterns/` → `.opencode/patterns/`
- `.claude/service-profile.md` → `.opencode/service-profile.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/<skill>/...` → `.opencode/skills/<skill>/...` (or `~/.config/opencode/skills/<skill>/...` for global installs)
- "Co-Authored-By: Claude <claude@anthropic.com>" → leave (informational; agents rarely commit here)

## Commands

**Rule:** port to `commands/<name>.md` (filename = command). Namespace filenames to avoid collisions: `discover` → `platform-discover` / `gtm-discover`; `status` → `activity-status`; platform commands get the `platform-` prefix for consistency.

Frontmatter:

| Field | Claude Code | OpenCode | Action |
|-------|-------------|----------|--------|
| `name` | required | not used (filename) | drop |
| `description` | required | required | keep |
| `agent` | e.g. `general-purpose` | e.g. `general` | map `general-purpose` → `general` |
| `model` | `sonnet`, ... | `provider/model-id` | drop |
| `tools` | `Read, ...` | no equivalent | drop |
| `disable-model-invocation` | bool | no equivalent | drop |
| `context` | `fork` / inline | `subtask: true` mirrors `fork` | set `subtask: true` when source used `context: fork` |
| `argument-hint` | string | no equivalent (document in body) | drop |
| — | — | `subtask` (bool) | add where applicable |

Body (the prompt template) is portable as-is. OpenCode supports `$ARGUMENTS`, positional `$1`/`$2`/..., `` !`cmd` `` shell-output injection, and `@file` references — all the same syntax the source uses.

## Hooks

**Rule:** there is no `hooks.json` in OpenCode. Each source hook ports to a handler inside the TS plugin module (`src/auto-validate.ts`).

### auto-validate (PostToolUse → warn)

| Source | OpenCode |
|--------|----------|
| `hooks.json` `PostToolUse` matcher `Write\|Edit` | `tool.execute.after` event (filter on `input.tool === "write" \|\| "edit"` in the handler) |
| stdin JSON `{tool_name, tool_input:{file_path}}` | handler args: `(input, output)` — `output.args.filePath` |
| `${CLAUDE_PLUGIN_ROOT}/scripts/auto-validate.sh` | resolve via `path.join(worktree, ".opencode/skills/<skill>/scripts/<validator>.sh")` from the plugin context |
| `exit 0` (warn-only) | call `client.app.log({ level: "warn", ... })`; do not throw |
| `exit 2` (block) | throw an `Error` (we do not use this — keep warn-only) |

### pr-op-gate (PreToolUse → block)

| Source | OpenCode |
|--------|----------|
| `hooks.json` `PreToolUse` matcher `Bash` | `tool.execute.before` event (filter on `input.tool === "bash"`) |
| stdin JSON `{tool_name:"Bash", tool_input:{command}}` | wrapper feeds `output.args.command` to the script as the same JSON |
| `hooks/pr-op-gate` script | shipped unchanged at `scripts/pr-op-gate`, installed to `~/.config/opencode/scripts/`; wrapper runs it via `spawn("bash", [script])` |
| `${CLAUDE_PLUGIN_ROOT}` | the plugin passes `CLAUDE_PLUGIN_ROOT=<installed config dir>` so the script resolves `skills/clear-writing/SKILL.md` |
| `hookSpecificOutput.permissionDecision: "deny"` | wrapper throws an `Error` with the reason (blocks the `gh` call) |
| `hookSpecificOutput.additionalContext` | wrapper logs it via `client.app.log({ level: "info" })` |

The gate fires only on `gh pr|issue create|edit` commands (the script early-exits otherwise), measures the posted body against the pr-conventions/clear-writing bar, and on `edit` compares against the live body.

See `src/auto-validate.ts` for both ported handlers.

## Versioning

Follow semver in `package.json`:

- **Patch** (1.0.x): frontmatter fixes, typo corrections, doc updates.
- **Minor** (1.x.0): new skills, agents, or commands; significant doc additions.
- **Major** (x.0.0): breaking changes to agent/command/skill contracts or the TS hook.

Update `CHANGELOG.md` and `README.md` pack table on every release.
