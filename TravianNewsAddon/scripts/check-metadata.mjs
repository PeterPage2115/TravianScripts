#!/usr/bin/env node
/**
 * check-metadata.mjs — dependency-free ESM static checker (task-2 scaffold).
 *
 * Responsibilities:
 * 1. Scan every JSON file under tests/fixtures/ for forbidden secret-shaped keys
 *    (case-insensitive: cookie, authorization, token, session) and fail loudly.
 * 2. When travian-region-news.user.js exists, parse its Tampermonkey metadata and
 *    assert the exact host/permission contract:
 *      - exactly one @match: https://cw.x2.international.travian.com/*
 *      - @run-at document-idle
 *      - @noframes
 *      - @grant GM_getValue and @grant GM_setValue (exactly these two)
 *      - no @connect
 *      - no external URLs besides the exact world host and the known Tampermonkey
 *        docs/support links (allowed in comments only)
 *    Until Todo 3 creates the userscript this branch is skipped.
 *
 * Prints PASS/FAIL lines and exits non-zero when any executed assertion fails.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES_DIR = path.join(PROJECT_ROOT, 'tests', 'fixtures');
export const USERSCRIPT_PATH = path.join(PROJECT_ROOT, 'travian-region-news.user.js');

export const FORBIDDEN_KEY_PATTERNS = Object.freeze(['cookie', 'authorization', 'token', 'session']);
export const EXACT_MATCH_VALUE = 'https://cw.x2.international.travian.com/*';

/**
 * Hosts that may appear as literal URLs in the userscript source. Anything else
 * (e.g. a broad @connect target or a telemetry endpoint) fails the check.
 */
const ALLOWED_EXTERNAL_HOSTS = Object.freeze([
  'cw.x2.international.travian.com',
  'tampermonkey.net',
]);

/** Recursively collect object keys matching a forbidden pattern. */
export function collectForbiddenKeys(value, trail = '$') {
  const hits = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => hits.push(...collectForbiddenKeys(item, `${trail}[${index}]`)));
    return hits;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const lower = key.toLowerCase();
      const pattern = FORBIDDEN_KEY_PATTERNS.find((candidate) => lower.includes(candidate));
      if (pattern) hits.push({ path: `${trail}.${key}`, pattern });
      hits.push(...collectForbiddenKeys(child, `${trail}.${key}`));
    }
  }
  return hits;
}

/** Recursively list *.json files below dir (sorted for deterministic output). */
export function listJsonFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listJsonFiles(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) found.push(full);
  }
  return found.sort();
}

/** Assert every JSON fixture is parseable and free of forbidden keys. */
export function checkFixtures(log = console.log) {
  if (!existsSync(FIXTURES_DIR)) {
    log(`FAIL fixtures: ${path.relative(PROJECT_ROOT, FIXTURES_DIR)} does not exist`);
    return false;
  }

  const files = listJsonFiles(FIXTURES_DIR);
  if (files.length === 0) {
    log('FAIL fixtures: no JSON fixtures found under tests/fixtures/');
    return false;
  }

  const failures = [];
  for (const file of files) {
    const relative = path.relative(PROJECT_ROOT, file);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      failures.push(`${relative}: not valid JSON (${error.message})`);
      continue;
    }
    const hits = collectForbiddenKeys(parsed);
    if (hits.length > 0) {
      for (const hit of hits) {
        failures.push(`${relative}: forbidden key "${hit.path}" matches "${hit.pattern}"`);
      }
    } else {
      log(`PASS fixtures: ${relative} — no forbidden secret-shaped keys`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) log(`FAIL fixtures: ${failure}`);
    return false;
  }
  log(`PASS fixtures: scanned ${files.length} JSON file(s) for cookie/authorization/token/session keys`);
  return true;
}

/** Parse // ==UserScript== ... // ==/UserScript== entries into {key, value}. */
export function parseMetadata(source) {
  const block = source.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  if (!block) return null;
  const entries = [];
  for (const rawLine of block[1].split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*\/\/\s?/, '').trim();
    const match = line.match(/^@([A-Za-z0-9_-]+)(?:\s+(.*))?$/);
    if (match) entries.push({ key: match[1], value: (match[2] ?? '').trim() });
  }
  return entries;
}

/** Extract literal http(s) URLs from the source (metadata, code, comments). */
export function findExternalUrls(source) {
  const urls = new Set();
  const pattern = /https?:\/\/[^\s"'`<>)\]},;]+/gi;
  for (const match of source.matchAll(pattern)) urls.add(match[0]);
  return [...urls];
}

/** A URL is allowed only on the exact world host or *.tampermonkey.net docs/support. */
export function isAllowedExternalUrl(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return ALLOWED_EXTERNAL_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** Assert the userscript metadata/security contract. */
export function checkUserscript(source, log = console.log) {
  const failures = [];
  const pass = (message) => log(`PASS userscript: ${message}`);
  const fail = (message) => {
    failures.push(message);
    log(`FAIL userscript: ${message}`);
  };

  const entries = parseMetadata(source);
  if (!entries) {
    fail('missing // ==UserScript== ... // ==/UserScript== metadata block');
    return false;
  }

  const matches = entries.filter((entry) => entry.key === 'match').map((entry) => entry.value);
  if (matches.length === 1 && matches[0] === EXACT_MATCH_VALUE) {
    pass(`@match is exactly ${EXACT_MATCH_VALUE}`);
  } else {
    fail(`@match must be exactly one entry "${EXACT_MATCH_VALUE}", found ${JSON.stringify(matches)}`);
  }

  const requireEntry = (key, value) => {
    const found = entries.some((entry) => entry.key === key && (value === undefined || entry.value === value));
    if (found) pass(value === undefined ? `@${key} present` : `@${key} ${value} present`);
    else fail(value === undefined ? `@${key} missing` : `@${key} ${value} missing`);
  };
  requireEntry('run-at', 'document-idle');
  requireEntry('noframes');
  requireEntry('grant', 'GM_getValue');
  requireEntry('grant', 'GM_setValue');

  const connects = entries.filter((entry) => entry.key === 'connect').map((entry) => entry.value);
  if (connects.length === 0) pass('no @connect entries');
  else fail(`@connect must be absent, found ${JSON.stringify(connects)}`);

  const grants = entries
    .filter((entry) => entry.key === 'grant')
    .map((entry) => entry.value)
    .sort();
  const expectedGrants = ['GM_getValue', 'GM_setValue'];
  if (JSON.stringify(grants) === JSON.stringify(expectedGrants)) {
    pass(`grants are exactly ${expectedGrants.join(', ')}`);
  } else {
    fail(`grants must be exactly ${JSON.stringify(expectedGrants)}, found ${JSON.stringify(grants)}`);
  }

  const urls = findExternalUrls(source);
  const violations = urls.filter((url) => !isAllowedExternalUrl(url));
  if (violations.length === 0) {
    pass(`no disallowed external URLs (scanned ${urls.length})`);
  } else {
    fail(`external URLs not allowed: ${violations.join(', ')}`);
  }

  return failures.length === 0;
}

function main() {
  const fixturesOk = checkFixtures();

  let userscriptOk = true;
  if (!existsSync(USERSCRIPT_PATH)) {
    console.log('SKIP userscript: travian-region-news.user.js not present yet — metadata assertions activate automatically once Todo 3 adds it');
  } else {
    userscriptOk = checkUserscript(readFileSync(USERSCRIPT_PATH, 'utf8'));
  }

  if (fixturesOk && userscriptOk) {
    console.log('PASS metadata check');
  } else {
    console.error('FAIL metadata check');
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
