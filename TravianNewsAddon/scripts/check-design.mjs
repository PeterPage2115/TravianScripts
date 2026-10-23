#!/usr/bin/env node
// Design-contract guard for the Travian region-news userscript.
// Dependency-free ESM. Run from anywhere: `node scripts/check-design.mjs`.
// Resolves DESIGN.md relative to the project root via this script's URL.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DESIGN_URL = new URL('../DESIGN.md', import.meta.url);
const DESIGN_PATH = fileURLToPath(DESIGN_URL);

const REQUIRED_HEADINGS = [
  '## 1. Atmosphere & Identity',
  '## 2. Color',
  '## 3. Typography',
  '## 4. Spacing & Layout',
  '## 5. Components',
  '## 6. Motion & Interaction',
  '## 7. Depth & Surface',
  '## 8. Accessibility Constraints & Accepted Debt',
];

const REQUIRED_PRIMITIVE = 'RegionEventLabel';

const FORBIDDEN_TOKENS = [
  { name: 'raw hex color', pattern: /#[0-9a-fA-F]{3,8}/ },
  { name: 'rgb(', pattern: /rgb\(/ },
  { name: 'hsl(', pattern: /hsl\(/ },
  { name: 'box-shadow', pattern: /box-shadow/ },
  { name: 'animation', pattern: /animation/ },
  { name: '@font-face', pattern: /@font-face/ },
  { name: '@import', pattern: /@import/ },
];

function fail(message) {
  process.stderr.write(`FAIL: ${message}\n`);
  process.exit(1);
}

if (!existsSync(DESIGN_PATH)) {
  fail(`DESIGN.md not found at ${DESIGN_PATH}`);
}

const content = readFileSync(DESIGN_PATH, 'utf8');
const lines = content.split(/\r?\n/);

for (const heading of REQUIRED_HEADINGS) {
  if (!lines.some((line) => line.trim() === heading)) {
    fail(`missing required heading "${heading}" in DESIGN.md`);
  }
}

if (!content.includes(REQUIRED_PRIMITIVE)) {
  fail(`missing required component primitive "${REQUIRED_PRIMITIVE}" in DESIGN.md`);
}

for (const { name, pattern } of FORBIDDEN_TOKENS) {
  for (let i = 0; i < lines.length; i += 1) {
    const match = pattern.exec(lines[i]);
    if (match) {
      fail(
        `forbidden token "${name}" (matched "${match[0]}") on line ${i + 1}: ${lines[i].trim()}`,
      );
    }
  }
}

process.stdout.write('PASS\n');
process.exit(0);
