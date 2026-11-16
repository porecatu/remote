// SPDX-License-Identifier: GPL-3.0-or-later

// Fails when a production dependency carries a license outside the allow list
// (all of them compatible with GPL-3.0-or-later). Runs locally and in CI:
//
//   node scripts/check-licenses.mjs
//
// Reads `pnpm licenses list --json --prod`. An SPDX expression passes when at
// least one `OR` alternative passes, and an alternative passes when every
// `AND` term is allowed. Anything else (UNLICENSED, UNKNOWN, a license with an
// exception) fails and names the offending package.

import { spawnSync } from "node:child_process";

const ALLOWED = new Set([
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
  "BlueOak-1.0.0",
  "MPL-2.0",
  "Python-2.0",
  "CC-BY-4.0",
  // The app's own license, and the one of the Porecatu packages it depends on.
  "GPL-3.0-or-later",
]);

/** True when the SPDX expression is satisfiable using only allowed licenses. */
function isAllowed(expression) {
  const flat = expression.replace(/[()]/g, " ").trim();
  if (flat === "") {
    return false;
  }
  return flat.split(/\s+OR\s+/).some((alternative) =>
    alternative
      .trim()
      .split(/\s+AND\s+/)
      .every((term) => ALLOWED.has(term.trim())),
  );
}

function listLicenses() {
  // One fixed command string through the shell: on Windows `pnpm` is a .cmd
  // shim, which does not run without one.
  const result = spawnSync("pnpm licenses list --json --prod", {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    shell: true,
  });
  if (result.error !== undefined || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr;
    throw new Error(`pnpm licenses list failed: ${detail}`);
  }
  return JSON.parse(result.stdout);
}

function main() {
  const byLicense = listLicenses();
  const offenders = [];
  let total = 0;
  for (const [license, packages] of Object.entries(byLicense)) {
    for (const pkg of packages) {
      total += 1;
      // pnpm groups by license string; the per-package field is the same.
      if (!isAllowed(license)) {
        offenders.push(`${pkg.name}@${(pkg.versions ?? []).join(",")} (${license})`);
      }
    }
  }
  if (offenders.length > 0) {
    // process.stdout/stderr instead of console: the lint rule `no-console`
    // is on for the whole repository, and this script is linted like any other.
    process.stderr.write("Licenses outside the allow list:\n");
    for (const offender of offenders) {
      process.stderr.write(`  ${offender}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(`OK: ${total} production packages, all licenses allowed.\n`);
}

main();
