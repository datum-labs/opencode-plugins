# Troubleshooting

Common issues when installing or running `@datum-cloud/opencode-plugins`.

## Skills/agents/commands not discovered

OpenCode discovers from these paths (first match wins):

- Project: `.opencode/{agents,commands,skills}/`
- Global: `~/.config/opencode/{agents,commands,skills}/`
- Claude-compat: `.claude/skills/` (skills only)

Check:

1. `postinstall.mjs` ran — look for the `[opencode-plugins] installed N file(s) into ...` line in the install output. Files land in `~/.config/opencode/` (or `$OPENCODE_CONFIG_DIR` if set).
2. Files actually present: `ls ~/.config/opencode/agents ~/.config/opencode/commands ~/.config/opencode/skills`.
3. No name collisions: skill `name` frontmatter must equal the directory name and match `^[a-z0-9]+(-[a-z0-9]+)*$`. Run `ls ~/.config/opencode/skills` and confirm each dir name is lowercase-hyphenated.
4. `SKILL.md` is all-caps (not `skill.md`).

## `auto-validate` hook not running

- Confirm the package is listed in `opencode.json` `plugin` array and OpenCode reinstalled it (`opencode` logs plugin load at startup).
- The hook only fires on `write`/`edit` tool calls. Edit a `.go` or `kustomization.yaml` file and watch for a `client.app.log` warn entry.
- Validator scripts must be executable and on the worktree: `chmod +x skills/<skill>/scripts/*.sh` and check the paths resolved in `src/auto-validate.ts` match your install location.

## `milo-activity` skills error on `activity`

The milo-activity skills shell out to an `activity` binary. Install and configure it as an MCP server separately (see the upstream `activity` docs). Skills will fail with `command not found` until it is on your `PATH`.

## postinstall overwrote my custom agent

It does not — `postinstall.mjs` skips files that already exist. To force-refresh, delete the target file under `~/.config/opencode/` and reinstall, or `rm -rf ~/.config/opencode/{agents,commands,skills}` and re-run `node node_modules/@datum-cloud/opencode-plugins/postinstall.mjs`.

## TypeScript typecheck fails

```bash
npm run typecheck
```

Requires `@opencode-ai/plugin` types. If types are unresolved, run `npm install` (or `bun install`) so the dev dependency resolves.
