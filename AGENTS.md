# AGENTS.md

Guidance for AI agents working in this repository.

## Repository Overview

This is the **opencode-plugins** package — a port of the
[`datum-cloud/claude-code-plugins`](https://github.com/datum-cloud/claude-code-plugins)
Claude Code marketplace to [OpenCode](https://opencode.ai). It ships a single npm
package (`@datum-cloud/opencode-plugins`) containing agents, skills, commands, and
one TypeScript hook plugin, distributed via the `opencode.json` `plugin` array.

The three source Claude Code plugins are merged flat into one collection:

- **datum-platform** — Kubernetes platform engineering (aggregated API servers,
  controller patterns, GitOps deployment). Contributes 7 agents, 32 skills, 8
  commands, and two hooks (`auto-validate` warn + `pr-op-gate` block).
- **datum-gtm** — Go-to-market automation. Contributes 4 agents, 4 skills, 1
  command.
- **milo-activity** — Milo Activity service (audit logs, incidents, policies).
  Contributes 2 agents, 7 skills, 0 commands.

## Repository Structure

```
opencode-plugins/
├── package.json            # @datum-cloud/opencode-plugins; postinstall copies markdown global
├── postinstall.mjs         # copies agents/commands/skills/scripts into ~/.config/opencode/
├── tsconfig.json
├── src/
│   └── auto-validate.ts    # TS hook plugin (tool.execute.before/after): auto-validate + pr-op-gate
├── scripts/
│   └── pr-op-gate          # unchanged gh pr/issue body gate (invoked by the plugin)
├── agents/*.md             # 13 opencode subagents (filename = agent name)
├── commands/*.md           # 9 slash commands (namespaced: platform-*, gtm-*)
├── skills/<name>/          # 43 skill dirs, each with SKILL.md + topic files + optional scripts/
├── docs/
│   ├── porting-guide.md    # claude→opencode field mapping reference
│   └── troubleshooting.md
├── README.md
└── CHANGELOG.md
```

## Key Concepts (opencode model)

- **Skills**: `skills/<name>/SKILL.md` discovered from `.opencode/skills/` or
  `~/.config/opencode/skills/` (opencode also reads `.claude/skills/`). Frontmatter
  requires `name` (must match dir, regex `^[a-z0-9]+(-[a-z0-9]+)*$`) and
  `description` (1–1024 chars).
- **Agents**: `agents/<name>.md` (filename = name). Frontmatter: `description`
  (required), `mode` (`subagent`/`primary`), `permission`, optional `model`,
  `temperature`, `hidden`. The built-in `build`/`plan` primaries exist; all ported
  agents here are `mode: subagent` and omit `model` (inherit the user's configured
  model).
- **Commands**: `commands/<name>.md` (filename = command). Frontmatter:
  `description`, optional `agent`, `model`, `subtask`. Body = prompt template
  supporting `$ARGUMENTS`, `$1..$N`, `!`backtick`` shell output, `@file` refs.
- **Plugins (TS)**: a JS/TS module exporting a `Plugin` function returning event
  hooks. Loaded from `.opencode/plugins/` or via the `opencode.json` `plugin` npm
  array. This package's only TS plugin is `src/auto-validate.ts`, which wires two
  datum-platform hooks: `tool.execute.after` (auto-validate, warn) and
  `tool.execute.before` (pr-op-gate, block, which shells out to
  `scripts/pr-op-gate`).

## Validation Commands

```bash
# Typecheck the TS hook plugin
npm run typecheck
# or: bunx tsc --noEmit

# Dry-run the postinstall into a temp dir
OPENCODE_CONFIG_DIR=/tmp/oc-test node postinstall.mjs
```

There is no marketplace validation (`claude plugin validate`) equivalent in
opencode — discovery is implicit from the `.opencode/` / `~/.config/opencode/`
directory layout.

## Porting Rules (see docs/porting-guide.md for the full table)

- **Skills**: 1:1 copy. Verify `name` frontmatter matches the directory and the
  opencode name regex. Trim `description` to ≤1024 chars if needed. Unknown
  frontmatter fields are ignored by opencode (left in place).
- **Agents**: drop `name`/`tools`/`model`; keep `description`; set `mode: subagent`;
  map `tools` → `permission` (full tools → `edit/bash/read/glob/grep: allow`;
  read-only reviewers → `edit: deny, bash: deny`). Rewrite body references:
  `CLAUDE.md` → `AGENTS.md`, `.claude/pipeline/` → `.opencode/pipeline/`,
  `${CLAUDE_PLUGIN_ROOT}` → `.opencode/skills/<skill>/...` relative paths.
- **Commands**: drop `name`/`tools`/`model`/`disable-model-invocation`/`context`/
  `argument-hint`; keep `description` and `agent` (map `general-purpose` →
  `general`); set `subtask: true` where the source used `context: fork`. Namespace
  filenames to avoid collisions (e.g. `discover` → `platform-discover` /
  `gtm-discover`).
- **TS hook**: port `auto-validate.sh`'s dispatch table to a `tool.execute.after`
  event handler. Resolve validator scripts via the `worktree`/`directory` context
  (no `${CLAUDE_PLUGIN_ROOT}`). Keep warn-only (non-blocking) behavior matching the
  source `exit 0`.
- **pr-op-gate hook**: ship the unchanged `scripts/pr-op-gate` and invoke it from
  a `tool.execute.before` handler. The wrapper feeds `gh pr|issue create|edit` as
  Claude-protocol JSON stdin, reads the script's `hookSpecificOutput`, throws to
  block on `permissionDecision: "deny"`, and logs `additionalContext`/errors
  otherwise. The plugin sets `CLAUDE_PLUGIN_ROOT` (the installed config dir) so
  the script locates `skills/clear-writing/SKILL.md` for its phrase table.

## Versioning and Releases

Follow semantic versioning in `package.json`:

- **Patch** (1.0.x): frontmatter fixes, typo corrections, doc updates.
- **Minor** (1.x.0): new skills, agents, or commands; significant doc additions.
- **Major** (x.0.0): breaking changes to agent/command/skill contracts or the TS
  hook.

Maintain `CHANGELOG.md`. Update `README.md` if pack contents change. Publish with
`npm publish` (the `postinstall` script runs automatically for consumers).

## Path References

This package has no `${CLAUDE_PLUGIN_ROOT}` equivalent. Validator scripts live at
`skills/<skill>/scripts/*.sh` and are resolved at hook runtime relative to the
opencode worktree (`.opencode/skills/...` or `~/.config/opencode/skills/...`).
Agent/skill bodies reference them as `.opencode/skills/<skill>/scripts/<script>.sh`.

The `pr-op-gate` hook script ships at `scripts/pr-op-gate` and is installed to
`~/.config/opencode/scripts/`. At runtime the plugin exports `CLAUDE_PLUGIN_ROOT`
pointing at the installed config dir so the script can resolve
`skills/clear-writing/SKILL.md` for its phrase table.
