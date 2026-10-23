#!/usr/bin/env node
/**
 * check.mjs — dependency-free ESM orchestrator for repository checks.
 *
 * (a) If scripts/check-design.mjs exists it is spawned and its exit code is
 *     propagated. A parallel task owns that file; until it lands the check is
 *     skipped with a clear SKIP message and never fails the run.
 * (b) scripts/check-metadata.mjs is ALWAYS spawned and its exit code propagated.
 * (c) scripts/check-readme.mjs is ALWAYS spawned and its exit code propagated.
 *
 * Exits non-zero if any executed checker failed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPTS_DIR, '..');

const DESIGN_CHECK = path.join(SCRIPTS_DIR, 'check-design.mjs');
const METADATA_CHECK = path.join(SCRIPTS_DIR, 'check-metadata.mjs');
const README_CHECK = path.join(SCRIPTS_DIR, 'check-readme.mjs');

/** Spawn one Node checker, inheriting stdio, and return its exit code. */
function runNodeScript(scriptPath) {
  const relative = path.relative(PROJECT_ROOT, scriptPath);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`FAIL: could not spawn ${relative}: ${result.error.message}`);
    return 1;
  }
  if (typeof result.status === 'number') return result.status;
  console.error(`FAIL: ${relative} terminated by signal ${result.signal}`);
  return 1;
}

const executed = [];

// (a) Design checker — optional; owned by the parallel design task.
if (existsSync(DESIGN_CHECK)) {
  executed.push({ name: 'check-design.mjs', code: runNodeScript(DESIGN_CHECK) });
} else {
  console.log('SKIP: check-design.mjs not present');
}

// (b) Metadata/security checker — mandatory.
if (existsSync(METADATA_CHECK)) {
  executed.push({ name: 'check-metadata.mjs', code: runNodeScript(METADATA_CHECK) });
} else {
  console.error('FAIL: check-metadata.mjs not present');
  executed.push({ name: 'check-metadata.mjs', code: 1 });
}

// (c) Documentation checker — mandatory (README ships with the userscript).
if (existsSync(README_CHECK)) {
  executed.push({ name: 'check-readme.mjs', code: runNodeScript(README_CHECK) });
} else {
  console.error('FAIL: check-readme.mjs not present');
  executed.push({ name: 'check-readme.mjs', code: 1 });
}

const failed = executed.filter((entry) => entry.code !== 0);
if (failed.length > 0) {
  console.error(
    `FAIL: check(s) failed: ${failed.map((entry) => `${entry.name} (exit ${entry.code})`).join(', ')}`,
  );
  process.exit(1);
}

console.log(`PASS: all executed checks succeeded (${executed.map((entry) => entry.name).join(', ')})`);
