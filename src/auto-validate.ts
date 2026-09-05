// src/auto-validate.ts
//
// OpenCode plugin port of the datum-platform PostToolUse/PreToolUse hooks:
//
//  1. `auto-validate.sh`  (PostToolUse -> `tool.execute.after`): dispatches to
//     the unchanged per-skill validator scripts under `skills/<skill>/scripts/*.sh`
//     based on the edited file's name and path, and surfaces failures as
//     non-blocking warn-level server log entries (matching the source's `exit 0`
//     warn-only behavior).
//
//  2. `pr-op-gate`  (PreToolUse -> `tool.execute.before`): a blocking gate for
//     `gh pr|issue create|edit`. The unchanged `scripts/pr-op-gate` measures the
//     body being posted against the countable rules in the pr-conventions and
//     clear-writing skills and, via its JSON output, either denies (block) the
//     post or returns advisory context. This wrapper feeds the bash command to
//     the script as Claude-protocol JSON stdin, reads its `hookSpecificOutput`,
//     throws to block on `deny`, and logs the advisory context otherwise.
//
// Scripts are resolved relative to the installed opencode config directory
// (`~/.config/opencode/scripts/...`), which also serves as the value of the
// `${CLAUDE_PLUGIN_ROOT}` the scripts expect for locating
// `skills/<skill>/SKILL.md` (e.g. the clear-writing phrase table).

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import type { Plugin, PluginInput } from "@opencode-ai/plugin";

type ValidatorSpec = {
  /** Path to the validator script, relative to the skills root. */
  script: string;
  /**
   * Argument to pass to the validator. Either the edited file path (`"file"`)
   * or the edited file's directory (`"dir"`).
   */
  arg: "file" | "dir";
};

/** A rule that, when its predicate matches the edited file, selects validators. */
type Rule = {
  /** Returns true if the rule applies to the given file. */
  match: (filePath: string, fileName: string, dirName: string) => boolean;
  validators: ValidatorSpec[];
};

const SKILLS_REL = path.join(".opencode", "skills");

/** Resolve the skills root, preferring the worktree then the global config. */
function skillsRoot(worktree: string): string | null {
  const candidates = [
    path.join(worktree, SKILLS_REL),
    path.join(
      process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || "~", ".config"),
      "opencode",
      "skills",
    ),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const rules: Rule[] = [
  // Go files: Go convention checks + capability validators by path substring.
  {
    match: (filePath, fileName) => fileName.endsWith(".go"),
    validators: [
      { script: "go-conventions/scripts/check-imports.sh", arg: "file" },
      { script: "go-conventions/scripts/check-boilerplate.sh", arg: "file" },
    ],
  },
  {
    match: (filePath, fileName) => fileName.endsWith("_test.go"),
    validators: [{ script: "go-conventions/scripts/check-test-naming.sh", arg: "file" }],
  },
  {
    match: (filePath, fileName, dirName) =>
      fileName === "types.go" || dirName.includes("/apis/"),
    validators: [
      { script: "k8s-apiserver-patterns/scripts/validate-types.sh", arg: "file" },
    ],
  },
  {
    match: (filePath) => filePath.includes("quota"),
    validators: [
      { script: "capability-quota/scripts/validate-quota.sh", arg: "file" },
    ],
  },
  {
    match: (filePath) => filePath.includes("metric") || filePath.includes("telemetry"),
    validators: [
      { script: "capability-telemetry/scripts/validate-metrics.sh", arg: "file" },
    ],
  },
  {
    match: (filePath) => filePath.includes("activity") || filePath.includes("event"),
    validators: [
      { script: "capability-activity/scripts/validate-activity.sh", arg: "file" },
    ],
  },
  {
    match: (filePath) => filePath.includes("insight") || filePath.includes("alert"),
    validators: [
      { script: "capability-insights/scripts/validate-insights.sh", arg: "file" },
    ],
  },
  // Kustomize files.
  {
    match: (filePath, fileName) =>
      fileName === "kustomization.yaml" || fileName === "kustomization.yml",
    validators: [
      { script: "kustomize-patterns/scripts/validate-kustomize.sh", arg: "dir" },
      { script: "kustomize-patterns/scripts/check-security.sh", arg: "dir" },
    ],
  },
  // YAML in config/ or deploy/ directories.
  {
    match: (filePath, fileName, dirName) =>
      (fileName.endsWith(".yaml") || fileName.endsWith(".yml")) &&
      (dirName.includes("/config/") || dirName.includes("/deploy/")),
    validators: [
      { script: "kustomize-patterns/scripts/check-security.sh", arg: "file" },
    ],
  },
];

async function runValidator(
  $: PluginInput["$"],
  scriptPath: string,
  target: string,
): Promise<{ ok: boolean; output: string }> {
  if (!fs.existsSync(scriptPath)) {
    return { ok: true, output: "" }; // validator absent — skip silently (matches source `[ -x ]` guard)
  }
  try {
    const result =
      await $`bash ${scriptPath} ${target}`.nothrow().text();
    const out = result.trim();
    // Bun's `$` resolves to a ShellPromise; `.nothrow()` prevents throws on
    // non-zero exit. A non-zero exit means validation failed.
    const exitCode = (result as unknown as { exitCode?: number }).exitCode ?? 0;
    return { ok: exitCode === 0, output: out };
  } catch (err) {
    return { ok: false, output: `validator crashed: ${String(err)}` };
  }
}

/**
 * The `pr-op-gate` PreToolUse hook. Runs the unchanged `scripts/pr-op-gate`
 * against a `gh pr|issue create|edit` bash command and returns the outcome.
 *
 * Returns one of:
 *  - `{ type: "deny", reason }`       — the gate decided to block the post.
 *  - `{ type: "context", advice }`    — advisory context for the model.
 *  - `{ type: "skip" }`              — not a gated command, or script absent.
 *  - `{ type: "error", reason }`     — the gate itself failed to run/measure.
 */
async function runPrOpGate(
  command: string,
  pluginRoot: string,
  scriptPath: string,
): Promise<
  | { type: "deny"; reason: string }
  | { type: "context"; advice: string }
  | { type: "skip" }
  | { type: "error"; reason: string }
> {
  if (!fs.existsSync(scriptPath)) return { type: "skip" };
  // Mirror the script's own early-exit: only gate gh pr|issue create|edit.
  if (!/\bgh\s+(pr|issue)\s+(create|edit)\b/.test(command)) {
    return { type: "skip" };
  }

  const stdin = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command },
  });

  try {
    const { stdout, stderr, timedOut } = await runScriptWithStdin(
      scriptPath,
      stdin,
      pluginRoot,
    );
    if (timedOut) return { type: "skip" };
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput?: {
        permissionDecision?: string;
        permissionDecisionReason?: string;
        additionalContext?: string;
      };
    };
    const out = parsed.hookSpecificOutput;
    if (parsed && out?.permissionDecision === "deny") {
      return { type: "deny", reason: out.permissionDecisionReason ?? "Refused by the datum-platform pr-conventions gate." };
    }
    if (out?.additionalContext) {
      return { type: "context", advice: out.additionalContext };
    }
    return { type: "skip" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/gate could not|refused rather than pass/.test(message)) {
      return { type: "error", reason: message };
    }
    return { type: "skip" };
  }
}

/** Spawn bash over the script, write `stdin` JSON, capture stdout/stderr. */
function runScriptWithStdin(
  scriptPath: string,
  stdin: string,
  pluginRoot: string,
): Promise<{ stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [scriptPath], {
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
      timeout: 15_000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => (stdout += d));
    child.stderr.on("data", (d: string) => (stderr += d));
    let timedOut = false;
    child.on("error", reject);
    child.on("close", (code) => {
      if (code && code !== 0 && /gate could not|refused rather than pass/.test(`${stdout} ${stderr}`)) {
        reject(new Error(`${stdout} ${stderr}`.trim()));
        return;
      }
      resolve({ stdout, stderr, timedOut });
    });
    // Node `timeout` option kills the process but close may not fire as timedOut;
    // flag it if the kill happened because of the timeout.
    child.on("timeout", () => {
      timedOut = true;
    });
    child.stdin.end(stdin);
  });
}

export const AutoValidate: Plugin = async ({ worktree, $, client }: PluginInput) => {
  // Installed opencode config dir — e.g. ~/.config/opencode/. The plugin is
  // loaded from <dir>/plugins/auto-validate.ts and the scripts live in
  // <dir>/scripts/. This dir doubles as the scripts' ${CLAUDE_PLUGIN_ROOT}.
  const pluginRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const gateScript = path.join(pluginRoot, "scripts", "pr-op-gate");

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return;
      const args = (output.args ?? {}) as { command?: string };
      const command = args.command ?? "";
      const res = await runPrOpGate(command, pluginRoot, gateScript);
      if (res.type === "deny") {
        // Throw to block the bash call; the error message reaches the model so
        // it can revise the body before posting again.
        throw new Error(`datum-platform:pr-conventions gate: ${res.reason}`);
      }
      if (res.type === "context") {
        await client.app.log({
          body: {
            service: "pr-op-gate",
            level: "info",
            message: "PR/issue body advisory",
            extra: { command, advice: res.advice },
          },
        });
      } else if (res.type === "error") {
        await client.app.log({
          body: {
            service: "pr-op-gate",
            level: "warn",
            message: `pr-op-gate could not measure this body: ${res.reason}`,
          },
        });
      }
    },

    "tool.execute.after": async (input) => {
      if (input.tool !== "write" && input.tool !== "edit") return;
      const args = (input.args ?? {}) as { filePath?: string; file_path?: string };
      const filePath = args.filePath ?? args.file_path;
      if (!filePath) return;

      const root = skillsRoot(worktree);
      if (!root) return;

      const fileName = path.basename(filePath);
      const dirName = path.dirname(filePath);

      const failures: string[] = [];
      for (const rule of rules) {
        if (!rule.match(filePath, fileName, dirName)) continue;
        for (const spec of rule.validators) {
          const scriptPath = path.join(root, spec.script);
          const target = spec.arg === "file" ? filePath : dirName;
          const { ok, output } = await runValidator($, scriptPath, target);
          if (!ok && output) {
            failures.push(`${path.basename(spec.script)}: ${output}`);
          }
        }
      }

      if (failures.length > 0) {
        await client.app.log({
          body: {
            service: "auto-validate",
            level: "warn",
            message: `Validation warnings for ${fileName}`,
            extra: { file: filePath, failures },
          },
        });
      }
    },
  };
};

export default AutoValidate;
