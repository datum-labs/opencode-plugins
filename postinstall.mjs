#!/usr/bin/env node
// postinstall.mjs — copies bundled agents/, commands/, skills/ markdown into the
// user's global opencode config directory (~/.config/opencode/). Idempotent: never
// overwrites existing files so user edits are preserved. Mirrors the plannotator
// postinstall pattern for opencode plugin distribution.
//
// Run automatically on `npm install` / `bun install` of this package. Pass --quiet
// to suppress the summary line (used by the package.json postinstall script).

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const quiet = process.argv.includes("--quiet");
const home = os.homedir();
const globalConfigDir =
  process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, "opencode")
    : path.join(home, ".config", "opencode");

// Respect the opencode custom config directory if set.
const target = process.env.OPENCODE_CONFIG_DIR
  ? process.env.OPENCODE_CONFIG_DIR
  : globalConfigDir;

const categories = ["agents", "commands", "skills", "scripts"];
const srcRoot = __dirname;
let copied = 0;
let skipped = 0;

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    if (fs.existsSync(dst)) {
      skipped++;
      return;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied++;
  }
}

for (const cat of categories) {
  const srcDir = path.join(srcRoot, cat);
  if (!fs.existsSync(srcDir)) continue;
  copyRecursive(srcDir, path.join(target, cat));
}

if (!quiet) {
  process.stdout.write(
    `[opencode-plugins] installed ${copied} file(s) into ${target} (${skipped} already present, skipped).\n`
  );
}
