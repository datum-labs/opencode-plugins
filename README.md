# @datum-cloud/opencode-plugins

A port of the [`datum-cloud/claude-code-plugins`](https://github.com/datum-cloud/claude-code-plugins) Claude Code marketplace to [OpenCode](https://opencode.ai). It ships a single npm package containing agents, skills, commands, and one TypeScript hook plugin.

The three source Claude Code plugins are merged flat into one collection:

| Pack | Description | Agents | Skills | Commands | Hook |
|------|-------------|--------|--------|----------|------|
| **datum-platform** | Kubernetes platform engineering (aggregated API servers, controller patterns, GitOps deployment) | 7 | 32 | 8 | `auto-validate` + `pr-op-gate` |
| **datum-gtm** | Go-to-market automation (commercial strategy, product discovery, customer support) | 4 | 4 | 1 | — |
| **milo-activity** | Milo Activity service (audit logs, incidents, policy authoring) | 2 | 7 | 0 | — |
| **total** (deduplicated) | | 13 | 42 | 9 | 1 |

`work-tracking` (43rd skill) is written for this package and has **no upstream
counterpart** in `claude-code-plugins`; keep it in mind when syncing upstream.

## Installation

Add the package to your OpenCode config's `plugin` array:

```jsonc
// opencode.json (project) or ~/.config/opencode/opencode.json (global)
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@datum-cloud/opencode-plugins"]
}
```

On startup, OpenCode installs the package via Bun and runs `postinstall.mjs`, which copies the bundled `agents/`, `commands/`, and `skills/` markdown into `~/.config/opencode/` (idempotent — existing files are never overwritten). The `auto-validate` TypeScript hook is loaded via the plugin entry point. Restart OpenCode and the agents/skills/commands are discovered automatically.

### Prerequisites

- **milo-activity** skills expect the `activity` binary on your `PATH` and configured as an MCP server separately.
- The **datum-platform** `auto-validate` hook invokes the per-skill `scripts/*.sh` validators; these ship under `skills/<skill>/scripts/` and run via your shell.

## Repository structure

```
opencode-plugins/
├── package.json            # @datum-cloud/opencode-plugins
├── postinstall.mjs         # copies markdown into ~/.config/opencode/
├── src/
│   └── auto-validate.ts    # TS hook plugin (tool.execute.before/after): auto-validate + pr-op-gate
├── scripts/
│   └── pr-op-gate          # unchanged gh pr/issue body gate (invoked by the plugin)
├── agents/*.md             # 13 opencode subagents
├── commands/*.md           # 9 slash commands (namespaced: platform-*, gtm-*)
├── skills/<name>/          # 43 skill dirs (SKILL.md + topic files + scripts/)
├── docs/
│   ├── porting-guide.md    # claude→opencode mapping reference
│   └── troubleshooting.md
├── AGENTS.md
├── CHANGELOG.md
└── README.md
```

## Agents

### datum-platform (7)

`api-dev`, `code-reviewer`, `frontend-dev`, `operational-reviewer`, `sre`, `tech-writer`, `test-engineer`.

> The source `datum-platform/agents/plan.md` is intentionally **not** ported — OpenCode ships a built-in primary `plan` agent. All ported agents are `mode: subagent` and omit `model` (they inherit the user's configured model).

### datum-gtm (4)

`commercial-strategist`, `gtm-comms`, `product-discovery`, `support-triage`.

### milo-activity (2)

`incident-investigator` (read-only investigation), `policy-author` (interactive policy creation).

## Commands

All commands are namespaced to avoid collisions across packs (`discover` exists in both datum-platform and datum-gtm):

`platform-corrections`, `platform-deploy`, `platform-discover`, `platform-evolve`, `platform-patterns`, `platform-pipeline`, `platform-review`, `platform-trends`, `gtm-discover`.

## Validation

```bash
npm run typecheck        # tsc --noEmit on the TS hook
OPENCODE_CONFIG_DIR=/tmp/oc-test node postinstall.mjs   # dry-run install
```

## Documentation

- [Porting guide](./docs/porting-guide.md) — field-by-field Claude Code → OpenCode mapping reference.
- [Troubleshooting](./docs/troubleshooting.md)
- [OpenCode plugins docs](https://opencode.ai/docs/plugins/)
- [OpenCode skills docs](https://opencode.ai/docs/skills/)

## License

MIT
