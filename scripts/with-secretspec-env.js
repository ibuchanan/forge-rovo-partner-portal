#!/usr/bin/env node
// Generic replacement for `secretspec run --provider dotenv --reason "..." -- <command>`.
// That CLI isn't distributed via npm (only the secretspec Node SDK is), so this resolves
// secretspec.toml against dotenv, exports every declared value into process.env, then runs
// the given command (everything after `--`) inheriting it.
//
// Usage: node scripts/with-secretspec-env.js --reason "<reason>" -- <command> [args...]

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SecretSpec } from "secretspec";

export function parseArgs(argv) {
  const sepIndex = argv.indexOf("--");
  if (sepIndex === -1 || sepIndex === argv.length - 1) {
    throw new Error(
      'Usage: with-secretspec-env.js --reason "<reason>" -- <command> [args...]',
    );
  }

  const before = argv.slice(0, sepIndex);
  const [command, ...commandArgs] = argv.slice(sepIndex + 1);

  const reasonIndex = before.indexOf("--reason");
  const reason =
    reasonIndex === -1
      ? "npm run with-secretspec-env"
      : before[reasonIndex + 1];

  return { command, commandArgs, reason };
}

function main() {
  const { command, commandArgs, reason } = parseArgs(process.argv.slice(2));

  const resolved = SecretSpec.builder()
    .withProvider("dotenv")
    .withReason(reason)
    .load();

  try {
    resolved.setAsEnv();
    execFileSync(command, commandArgs, { stdio: "inherit", env: process.env });
  } finally {
    resolved.dispose();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
