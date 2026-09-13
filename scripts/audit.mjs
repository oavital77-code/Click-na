#!/usr/bin/env node
/**
 * Dependency audit gate.
 *
 * `npm audit --audit-level=high` alone is not usable as a CI gate here: it
 * fails on advisories we have analysed and cannot act on, and a check that is
 * permanently red is a check everybody learns to scroll past. This wraps it so
 * that a KNOWN, WRITTEN-DOWN exception passes and anything else fails.
 *
 * Three ways to fail, deliberately:
 *   1. A high/critical advisory that is not in .audit-allowlist.json.
 *   2. An allowlist entry whose reviewBy date has passed — an exception with no
 *      expiry is not an exception, it is permanent blindness.
 *   3. An allowlist entry that no longer matches anything — the advisory was
 *      fixed, so the excuse should go with it.
 *
 * Run it the same way locally: `node scripts/audit.mjs`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BLOCKING = new Set(["high", "critical"]);

function npmAudit() {
  try {
    // Exits non-zero whenever anything is found, so the throw is the normal path.
    return JSON.parse(execFileSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

function advisoriesOf(report) {
  const found = new Map();
  for (const vuln of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      // A string `via` means "vulnerable because a parent is" — the advisory
      // itself is recorded on the parent, so there is nothing to collect here.
      if (typeof via !== "object" || !BLOCKING.has(via.severity)) continue;
      const id = String(via.url ?? "").split("/").pop();
      if (id) found.set(id, { id, package: via.name, severity: via.severity, title: via.title });
    }
  }
  return found;
}

const report = npmAudit();
const found = advisoriesOf(report);
const allowed = JSON.parse(readFileSync(new URL("../.audit-allowlist.json", import.meta.url), "utf8"));
const today = new Date().toISOString().slice(0, 10);

const unexpected = [...found.values()].filter((a) => !allowed.some((e) => e.advisory === a.id));
const expired = allowed.filter((e) => e.reviewBy < today);
const stale = allowed.filter((e) => !found.has(e.advisory));

for (const a of unexpected) {
  console.error(`✗ unreviewed ${a.severity}: ${a.id} in ${a.package}\n  ${a.title}`);
}
for (const e of expired) {
  console.error(`✗ allowlist entry for ${e.advisory} (${e.package}) was due for review on ${e.reviewBy}.`);
  console.error("  Re-check whether a fix exists; extend the date only with a fresh reason.");
}
for (const e of stale) {
  console.error(`✗ allowlist entry for ${e.advisory} (${e.package}) matches nothing — the advisory is gone.`);
  console.error("  Delete the entry from .audit-allowlist.json.");
}

const accepted = allowed.filter((e) => found.has(e.advisory) && e.reviewBy >= today);
for (const e of accepted) {
  console.log(`· accepted ${e.advisory} (${e.package}) until ${e.reviewBy} — ${e.reason}`);
}

if (unexpected.length || expired.length || stale.length) {
  console.error(`\n${unexpected.length} unreviewed, ${expired.length} expired, ${stale.length} stale.`);
  process.exit(1);
}
console.log(`\nNo unreviewed high or critical advisories (${accepted.length} accepted, each with a review date).`);
