#!/usr/bin/env node
/**
 * check-readme.mjs — dependency-free ESM documentation guard (Todo 7).
 *
 * Asserts that README.md (resolved relative to this script) documents the
 * userscript's exact contract, and does NOT teach unsafe or out-of-scope setup:
 *
 *   required: exact world host, tile-details endpoint, the three Polish event
 *             wordings, 24-hour cache TTL, concurrency 2, >=300 ms spacing,
 *             per-page cap 50, privacy/data-minimization statement, install,
 *             uninstall + cache clearing, troubleshooting, logged-out or
 *             markup-change behavior, and "map.sql not required".
 *   forbidden: "@connect *", API-key acquisition/configuration instructions,
 *              map.sql setup instructions, credential-copy instructions.
 *
 * Warnings phrased as negations (e.g. "nie wklejaj ciasteczek") are allowed;
 * the forbidden patterns match imperative instructions only.
 *
 * CLI: `node scripts/check-readme.mjs` prints PASS and exits 0, or prints a
 * FAIL reason and exits 1.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const README_PATH = fileURLToPath(new URL('../README.md', import.meta.url));

if (!existsSync(README_PATH)) {
  process.stderr.write(`FAIL: README.md not found at ${README_PATH}\n`);
  process.exit(1);
}

const content = readFileSync(README_PATH, 'utf8');
const lines = content.split(/\r?\n/);

/** True when at least one line contains every needle (case-insensitive). */
function hasLineWithAll(haystackLines, needles) {
  const lowered = needles.map((needle) => needle.toLowerCase());
  return haystackLines.some((line) => {
    const candidate = line.toLowerCase();
    return lowered.every((needle) => candidate.includes(needle));
  });
}

/**
 * Required documentation facts. Each `test(content, lines)` returns truthy when
 * the fact is present; `name` is used verbatim in PASS/FAIL output.
 */
const REQUIRED = [
  {
    name: 'exact supported host cw.x2.international.travian.com',
    test: (text) => text.includes('cw.x2.international.travian.com'),
  },
  {
    name: 'tile-details endpoint /api/v1/map/tile-details',
    test: (text) => text.includes('/api/v1/map/tile-details'),
  },
  {
    name: 'event wording "założył(a) nową osadę"',
    test: (text) => text.includes('założył(a) nową osadę'),
  },
  {
    name: 'event wording "podbił(a) osadę"',
    test: (text) => text.includes('podbił(a) osadę'),
  },
  {
    name: 'event wording "utracił(a) osadę"',
    test: (text) => text.includes('utracił(a) osadę'),
  },
  {
    name: '24-hour cache TTL',
    test: (_text, docLines) => hasLineWithAll(docLines, ['24', 'cache']),
  },
  {
    name: 'concurrency limit 2',
    test: (text) => /2\s*równoleg/i.test(text),
  },
  {
    name: 'minimum request spacing 300 ms',
    test: (text) => /\b300\s*ms\b/i.test(text),
  },
  {
    name: 'per-page request cap 50',
    test: (_text, docLines) => hasLineWithAll(docLines, ['50', 'zapyta']),
  },
  {
    name: 'privacy / data-minimization statement',
    test: (text) => /prywatno/i.test(text) && text.includes('regionId') && text.includes('fetchedAt'),
  },
  {
    name: 'installation instructions',
    test: (text) => /instalacj/i.test(text),
  },
  {
    name: 'uninstallation instructions',
    test: (text) => /odinstal/i.test(text),
  },
  {
    name: 'clearing cache instructions',
    test: (_text, docLines) => hasLineWithAll(docLines, ['cache', 'wyczy']),
  },
  {
    name: 'troubleshooting section',
    test: (text) => /rozwiązywanie problemów/i.test(text),
  },
  {
    name: 'logged-out or markup-change behavior',
    test: (text) => /wylogow/i.test(text) && /znacznik/i.test(text),
  },
  {
    name: 'map.sql explicitly not required',
    test: (_text, docLines) => hasLineWithAll(docLines, ['map.sql', 'nie']),
  },
];

/**
 * Forbidden instructions. Each pattern matches an actual instruction; negated
 * warnings (a leading "nie " before the imperative) do not match.
 */
const FORBIDDEN = [
  {
    name: 'broad @connect wildcard',
    pattern: /@connect\s*\*/,
  },
  {
    name: 'API-key acquisition/configuration instruction',
    pattern:
      /(?<!nie\s)\b(?:pobierz|uzyskaj|zdobądź|zdobadz|skonfiguruj|wygeneruj|utwórz|wpisz)\b[^.\n]{0,40}?(?:klucz\w*\s+api|api[ _-]?key)/i,
  },
  {
    name: 'map.sql setup instruction',
    pattern:
      /(?<!nie\s)\b(?:pobierz|zaimportuj|uruchom|skonfiguruj|zainstaluj|odtwórz|odtworz|importuj)\b[^.\n]{0,40}?map\.sql/i,
  },
  {
    name: 'credential-copy instruction',
    pattern:
      /(?<!nie\s)\b(?:skopiuj|wklej|podaj|wstaw|wyślij|wyslij)\b[^.\n]{0,40}?(?:cookie|ciasteczk|token|hasł|hasl)/i,
  },
];

const failures = [];

for (const check of REQUIRED) {
  if (check.test(content, lines)) {
    process.stdout.write(`PASS readme: ${check.name}\n`);
  } else {
    const reason = `FAIL readme: missing ${check.name}`;
    failures.push(reason);
    process.stderr.write(`${reason}\n`);
  }
}

for (const check of FORBIDDEN) {
  const match = content.match(check.pattern);
  if (match) {
    const reason = `FAIL readme: forbidden ${check.name} (matched "${match[0]}")`;
    failures.push(reason);
    process.stderr.write(`${reason}\n`);
  } else {
    process.stdout.write(`PASS readme: no ${check.name}\n`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`FAIL README check (${failures.length} violation(s))\n`);
  process.exit(1);
}

process.stdout.write('PASS README check\n');
process.exit(0);
