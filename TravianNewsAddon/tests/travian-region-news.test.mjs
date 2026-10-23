/**
 * Deterministic contract tests for the Travian region-news userscript.
 *
 * Runner : Node's built-in test runner only — `npm test` == `node --test tests/*.test.mjs`
 * DOM    : jsdom (pinned 29.0.1), loaded via `import { JSDOM } from 'jsdom'`
 *
 * Structure note for later todos (3-8): append new top-level `test(...)` cases in
 * the marked section at the bottom; the shared helpers at the top (readFixtureText,
 * readFixtureJson, parseHTML, collectForbiddenKeys) are intentionally reusable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.join(HERE, 'fixtures');

/** Contract anchors locked by the live-verified tile-details response. */
export const SPARTA_REGION = Object.freeze({
  href: '/region/66',
  name: 'Sparta',
  coordinates: '(89|-97)',
});

/** The three real sidebar founding events (ASCII ASCII normalized from news.html:684-692). */
export const SIDEBAR_EVENTS = Object.freeze([
  { x: '89', y: '-97' },
  { x: '-139', y: '-27' },
  { x: '-127', y: '-53' },
]);

/** Approved Polish event wordings (exact). */
export const EVENT_WORDINGS = Object.freeze({
  founding: 'założył(a) nową osadę',
  conquest: 'podbił(a) osadę',
  loss: 'utracił(a) osadę',
});

export const FORBIDDEN_FIXTURE_KEY_PATTERNS = Object.freeze([
  'cookie',
  'authorization',
  'token',
  'session',
]);

export function readFixtureText(name) {
  return readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

export function readFixtureJson(name) {
  return JSON.parse(readFixtureText(name));
}

const sharedWindow = new JSDOM('<!doctype html><html><body></body></html>').window;

/** Parse an HTML string the same way the userscript parses payload.html. */
export function parseHTML(html) {
  return new sharedWindow.DOMParser().parseFromString(html, 'text/html');
}

/** Recursively collect forbidden secret-shaped object keys. */
export function collectForbiddenKeys(value, trail = '$') {
  const hits = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => hits.push(...collectForbiddenKeys(item, `${trail}[${index}]`)));
    return hits;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const lower = key.toLowerCase();
      const pattern = FORBIDDEN_FIXTURE_KEY_PATTERNS.find((candidate) => lower.includes(candidate));
      if (pattern) hits.push({ path: `${trail}.${key}`, pattern });
      hits.push(...collectForbiddenKeys(child, `${trail}.${key}`));
    }
  }
  return hits;
}

/** Recursively list *.json files under dir (sorted). */
export function listJsonFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listJsonFiles(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) found.push(full);
  }
  return found.sort();
}

/** Normalize a /karte.php?x=&y= href into "x,y" or null when malformed. */
export function parseCoordinateHref(href, origin = 'https://cw.x2.international.travian.com/') {
  if (typeof href !== 'string') return null;
  const url = new URL(href, origin);
  if (!url.pathname.endsWith('/karte.php')) return null;
  const x = url.searchParams.get('x');
  const y = url.searchParams.get('y');
  if (x === null || y === null) return null;
  if (!/^-?\d+$/.test(x) || !/^-?\d+$/.test(y)) return null;
  return `${x},${y}`;
}

// ---------------------------------------------------------------------------
// fixture contract tests
// ---------------------------------------------------------------------------

test('fixture contract: tile-details-sparta.json yields exactly one /region/66 "Sparta" anchor', () => {
  const fixture = readFixtureJson('tile-details-sparta.json');
  assert.equal(typeof fixture.html, 'string', 'fixture.html must be a JSON string');
  assert.ok(fixture.html.includes('id="village_info"'), 'fixture html must contain #village_info');

  const document = parseHTML(fixture.html);
  const regionAnchors = document.querySelectorAll('#village_info a[href^="/region/"]');
  assert.equal(regionAnchors.length, 1, 'exactly one region anchor inside #village_info');
  assert.equal(regionAnchors[0].getAttribute('href'), SPARTA_REGION.href);
  assert.equal(regionAnchors[0].textContent.trim(), SPARTA_REGION.name);
  assert.ok(
    fixture.html.includes(SPARTA_REGION.coordinates),
    `fixture html must mention ASCII coordinates ${SPARTA_REGION.coordinates}`,
  );
});

test('fixture contract: alliance-events-full.html has exactly one row per approved Polish event pattern', () => {
  const document = parseHTML(readFixtureText('alliance-events-full.html'));
  const rows = [...document.querySelectorAll('#allianceEvents tbody tr')];
  assert.equal(rows.length, 3, 'expected exactly three representative event rows');

  const countRowsMatching = (wording) =>
    rows.filter((row) => row.textContent.includes(wording)).length;
  assert.equal(countRowsMatching(EVENT_WORDINGS.founding), 1, 'exactly one founding row');
  assert.equal(countRowsMatching(EVENT_WORDINGS.conquest), 1, 'exactly one conquest row');
  assert.equal(countRowsMatching(EVENT_WORDINGS.loss), 1, 'exactly one loss row');

  const expectations = [
    { wording: EVENT_WORDINGS.founding, x: '89', y: '-97' },
    { wording: EVENT_WORDINGS.conquest, x: '-139', y: '-27' },
    { wording: EVENT_WORDINGS.loss, x: '-127', y: '-53' },
  ];

  for (const expectation of expectations) {
    const row = rows.find((candidate) => candidate.textContent.includes(expectation.wording));
    assert.ok(row, `row containing "${expectation.wording}" must exist`);

    const profileLinks = row.querySelectorAll('a[href^="/profile/"]');
    assert.ok(profileLinks.length >= 1, 'each row must contain a profile link');

    const coordinateLink = row.querySelector('a[href^="/karte.php"]');
    assert.ok(coordinateLink, 'each row must contain a /karte.php coordinate link');
    assert.equal(
      parseCoordinateHref(coordinateLink.getAttribute('href')),
      `${expectation.x},${expectation.y}`,
      `row must link to x=${expectation.x}&y=${expectation.y} as ASCII signed integers`,
    );
    assert.ok(
      row.textContent.includes(`(${expectation.x}|${expectation.y})`),
      `row textContent must contain the coordinate (${expectation.x}|${expectation.y})`,
    );
  }
});

test('fixture contract: visual-harness.html exposes both view roots and the tile-stub hook', () => {
  const html = readFixtureText('visual-harness.html');
  assert.ok(html.includes('id="sidebarBoxAlliance"'), 'harness must contain the sidebar view root');
  assert.ok(html.includes('id="allianceEvents"'), 'harness must contain the full-table view root');
  assert.ok(
    html.includes('window.__TRN_HARNESS_TILE_RESPONSES__'),
    'harness must expose the same-origin tile-details stub hook',
  );

  const document = parseHTML(html);
  const sidebar = document.querySelector('#sidebarBoxAlliance');
  const table = document.querySelector('#allianceEvents');
  assert.ok(sidebar, '#sidebarBoxAlliance must parse');
  assert.ok(table, '#allianceEvents must parse');

  const sidebarCoordinates = [...sidebar.querySelectorAll('li a[href^="/karte.php"]')].map((anchor) =>
    parseCoordinateHref(anchor.getAttribute('href')),
  );
  assert.deepEqual(
    sidebarCoordinates,
    SIDEBAR_EVENTS.map((event) => `${event.x},${event.y}`),
    'sidebar must contain the three real founding events',
  );

  const tableRows = [...table.querySelectorAll('tbody tr')];
  assert.equal(tableRows.length, 3, 'full-table view must contain the three representative rows');
});

// ---------------------------------------------------------------------------
// fixture hygiene
// ---------------------------------------------------------------------------

test('fixture hygiene: no cookie/authorization/token/session keys in JSON fixtures', () => {
  const files = listJsonFiles(FIXTURES_DIR);
  assert.ok(files.length >= 1, 'at least one JSON fixture expected');

  for (const file of files) {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const hits = collectForbiddenKeys(parsed);
    assert.deepEqual(
      hits,
      [],
      `${path.relative(FIXTURES_DIR, file)} must not contain forbidden secret-shaped keys`,
    );
  }
});

// ---------------------------------------------------------------------------
// Later todos (3-8): append userscript/client/DOM/end-to-end tests below.
// Reuse readFixtureText/readFixtureJson/parseHTML/parseCoordinateHref and keep
// the suite dependency-free (node:test + jsdom only).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Todo 3: tile-details client — parser, request contract, cache, queue, limits.
// Later todos (4-6) append their DOM/startup tests below this section.
// ---------------------------------------------------------------------------

const USERSCRIPT_PATH = path.resolve(HERE, '..', 'travian-region-news.user.js');
const WORLD_ORIGIN = 'https://cw.x2.international.travian.com';
const SPARTA_HTML = readFixtureJson('tile-details-sparta.json').html;

/** Load the real userscript into an isolated jsdom window in test mode. */
export function loadUserscriptTestApi(markup = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(markup, {
    runScripts: 'outside-only',
    url: 'https://cw.x2.international.travian.com/news.php',
  });
  dom.window.__TRN_TEST_MODE__ = true;
  dom.window.eval(readFileSync(USERSCRIPT_PATH, 'utf8'));
  const api = dom.window.__TRN_TEST_API__;
  assert.ok(api, '__TRN_TEST_API__ must be defined when __TRN_TEST_MODE__ is true');
  return { dom, window: dom.window, document: dom.window.document, api };
}

/** Copy a cross-realm (jsdom) value into plain Node-realm data for strict deepEqual. */
export function plainValue(value) {
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

/** Deterministic injectable clock: now/setTimeout/clearTimeout plus advance helpers. */
export function createFakeClock(startMs = 0) {
  let current = startMs;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => current,
    setTimeout(fn, delay = 0, ...args) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { id, at: current + Math.max(0, Number(delay) || 0), fn, args });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    pendingCount: () => timers.size,
    nextTimerAt() {
      let earliest = null;
      for (const timer of timers.values()) {
        if (earliest === null || timer.at < earliest) earliest = timer.at;
      }
      return earliest;
    },
    advance(ms) {
      const target = current + Math.max(0, Number(ms) || 0);
      for (;;) {
        let next = null;
        for (const timer of timers.values()) {
          if (timer.at > target) continue;
          if (next === null || timer.at < next.at || (timer.at === next.at && timer.id < next.id)) {
            next = timer;
          }
        }
        if (next === null) break;
        timers.delete(next.id);
        current = next.at;
        next.fn(...next.args);
      }
      current = target;
    },
  };
}

/** Minimal GM-storage-like adapter with observable writes. */
export function createFakeStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  const setCalls = [];
  return {
    data,
    setCalls,
    get(key) { return data.get(key); },
    set(key, value) {
      setCalls.push({ key, value });
      data.set(key, value);
    },
  };
}

/** Recording fake fetch programmable per request; tracks active/maxActive/settled. */
export function createFetchScript(clock) {
  const calls = [];
  const routes = [];
  let active = 0;
  let maxActive = 0;

  function on(match, handler) {
    routes.push({ match, handler });
    return script;
  }

  function script(url, options) {
    const body = JSON.parse(options.body);
    const call = {
      index: calls.length,
      method: options.method,
      url,
      headers: options.headers,
      body: options.body,
      credentials: options.credentials,
      signal: options.signal,
      x: body.x,
      y: body.y,
      startedAt: clock.now(),
    };
    calls.push(call);
    active += 1;
    maxActive = Math.max(maxActive, active);

    const route = routes.find((candidate) => candidate.match(call));
    if (!route) throw new Error(`unscripted fetch for x=${call.x} y=${call.y}`);
    let result;
    try {
      result = route.handler(call);
    } catch (error) {
      result = Promise.reject(error);
    }
    return Promise.resolve(result).then(
      (response) => {
        active -= 1;
        call.settled = true;
        return response;
      },
      (error) => {
        active -= 1;
        call.settled = true;
        throw error;
      },
    );
  }

  script.calls = calls;
  script.on = on;
  script.getActive = () => active;
  script.getMaxActive = () => maxActive;
  return script;
}

function jsonResponse(payload, status = 200) {
  return { status, json: async () => payload };
}

function textResponse(text, status = 200) {
  return { status, text: async () => text };
}

/** Response that settles only when the client aborts it (timeout/stop tests). */
function hangingResponse(call) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    if (!call.signal) return; // never settles without a signal
    if (call.signal.aborted) abort();
    else call.signal.addEventListener('abort', abort, { once: true });
  });
}

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Advance the fake clock through every scheduled timer until the queue is quiet. */
async function drain(clock, stepLimit = 1000) {
  for (let i = 0; i < stepLimit; i += 1) {
    await flushMicrotasks();
    if (clock.pendingCount() === 0) {
      await flushMicrotasks();
      if (clock.pendingCount() === 0) return;
      continue;
    }
    const next = clock.nextTimerAt();
    if (next === null || next <= clock.now()) clock.advance(0);
    else clock.advance(next - clock.now());
  }
  throw new Error(`drain exceeded ${stepLimit} steps`);
}

/** Wire the real client against the injectable fakes. */
export function createHarness({ api = null, clock = createFakeClock(), storage = createFakeStorage(), fetchScript = null } = {}) {
  const userscriptApi = api || loadUserscriptTestApi().api;
  const theFetch = fetchScript || createFetchScript(clock);
  const client = userscriptApi.createClient({
    fetch: theFetch,
    storage,
    now: () => clock.now(),
    setTimeout: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeout: (id) => clock.clearTimeout(id),
  });
  return { api: userscriptApi, client, clock, storage, fetchScript: theFetch };
}

// ---------------------------------------------------------------------------
// client parse
// ---------------------------------------------------------------------------

test('client parse: constants, coordinates and cache keys match the frozen contract', () => {
  const { api } = loadUserscriptTestApi();
  assert.ok(Object.isFrozen(api), '__TRN_TEST_API__ must be frozen');
  assert.ok(Object.isFrozen(api.constants), 'constants must be frozen');
  assert.deepEqual(plainValue(api.constants), {
    TTL_MS: 86400000,
    MAX_CONCURRENT: 2,
    MIN_START_GAP_MS: 300,
    PAGE_CAP: 50,
    TIMEOUT_MS: 10000,
    COOLDOWN_MS: 900000,
    CACHE_SCHEMA_VERSION: 1,
  });

  assert.equal(api.normalizeCoordinate('42'), 42);
  assert.equal(api.normalizeCoordinate(-97), -97);
  assert.equal(api.normalizeCoordinate('-139'), -139);
  assert.equal(api.normalizeCoordinate(-0), 0);
  assert.ok(Object.is(api.normalizeCoordinate(-0), 0), '-0 must normalize to +0');
  assert.equal(api.normalizeCoordinate('089'), null);
  assert.equal(api.normalizeCoordinate('+1'), null);
  assert.equal(api.normalizeCoordinate('1.5'), null);
  assert.equal(api.normalizeCoordinate(''), null);
  assert.equal(api.normalizeCoordinate('  7'), null);
  assert.equal(api.normalizeCoordinate('abc'), null);
  assert.equal(api.normalizeCoordinate(Number.NaN), null);
  assert.equal(api.normalizeCoordinate(Number.POSITIVE_INFINITY), null);
  assert.equal(api.normalizeCoordinate(null), null);
  assert.equal(api.normalizeCoordinate(undefined), null);

  assert.equal(api.makeCacheKey(WORLD_ORIGIN, 89, -97), `${WORLD_ORIGIN}:89|-97`);
  assert.equal(api.makeCacheKey(WORLD_ORIGIN, -0, '7'), `${WORLD_ORIGIN}:0|7`);
});

test('client parse: the locked Sparta fixture yields regionId 66 and regionName Sparta', () => {
  const { api } = loadUserscriptTestApi();
  const fixture = readFixtureJson('tile-details-sparta.json');

  const fromObject = api.parseTileDetailsResponse(fixture);
  assert.ok(fromObject, 'object payload {html} must parse');
  assert.ok(Object.isFrozen(fromObject), 'parsed region must be frozen');
  assert.deepEqual(plainValue(fromObject), { regionId: 66, regionName: 'Sparta' });

  const fromHtml = api.parseTileDetailsResponse(fixture.html);
  assert.deepEqual(plainValue(fromHtml), { regionId: 66, regionName: 'Sparta' });

  const fromJsonText = api.parseTileDetailsResponse(
    JSON.stringify({ html: '<div id="village_info"><a href="/region/7">  Rzym  </a></div>' }),
  );
  assert.deepEqual(plainValue(fromJsonText), { regionId: 7, regionName: 'Rzym' });
});

test('client parse: malformed payloads never fabricate a region', () => {
  const { api } = loadUserscriptTestApi();
  const cases = [
    ['missing #village_info', { html: '<div class="other"><a href="/region/66">Sparta</a></div>' }],
    ['malformed href /region/0', { html: '<div id="village_info"><a href="/region/0">Zero</a></div>' }],
    ['malformed href /region/abc', { html: '<div id="village_info"><a href="/region/abc">Nope</a></div>' }],
    ['malformed href /region/', { html: '<div id="village_info"><a href="/region/">Empty</a></div>' }],
    ['empty anchor text', { html: '<div id="village_info"><a href="/region/66">   </a></div>' }],
    ['truncated JSON string', '{"html":'],
    ['object without html', { regionId: 66 }],
    ['null payload', null],
    ['numeric payload', 123],
    [
      'first anchor malformed while a later anchor is valid',
      { html: '<div id="village_info"><a href="/region/0">Bad</a><a href="/region/66">Sparta</a></div>' },
    ],
  ];
  for (const [label, payload] of cases) {
    assert.equal(api.parseTileDetailsResponse(payload), null, `${label} must parse to null`);
  }
});

// ---------------------------------------------------------------------------
// client request contract
// ---------------------------------------------------------------------------

test('client request contract: exact POST, URL, headers, body and credentials', async () => {
  const h = createHarness();
  h.fetchScript.on(() => true, () => jsonResponse({ html: SPARTA_HTML }));

  const promise = h.client.resolve(89, -97, WORLD_ORIGIN);
  await drain(h.clock);
  assert.deepEqual(plainValue(await promise), { regionId: 66, regionName: 'Sparta' });

  assert.equal(h.fetchScript.calls.length, 1);
  const call = h.fetchScript.calls[0];
  assert.equal(call.method, 'POST');
  assert.equal(call.url, `${WORLD_ORIGIN}/api/v1/map/tile-details`);
  assert.equal(new URL(call.url).pathname, '/api/v1/map/tile-details');
  assert.equal(call.headers.Accept, 'application/json');
  assert.equal(call.headers['Content-Type'], 'application/json; charset=UTF-8');
  assert.deepEqual(Object.keys(call.headers).sort(), ['Accept', 'Content-Type']);
  assert.equal(call.body, '{"x":89,"y":-97}');
  assert.equal(call.credentials, 'same-origin');
  assert.ok(call.signal, 'an AbortSignal must be attached for the 10 second timeout');
});

// ---------------------------------------------------------------------------
// client dedupe
// ---------------------------------------------------------------------------

test('client dedupe: two concurrent resolves for one key share a single fetch', async () => {
  const h = createHarness();
  const releases = [];
  h.fetchScript.on(() => true, () => new Promise((resolve) => {
    releases.push(() => resolve(jsonResponse({ html: SPARTA_HTML })));
  }));

  const first = h.client.resolve(89, -97, WORLD_ORIGIN);
  const second = h.client.resolve(89, -97, WORLD_ORIGIN);
  await flushMicrotasks();
  assert.equal(h.fetchScript.calls.length, 1, 'only one network lookup for two resolves');
  assert.equal(h.client.getStats().inFlight, 1);

  releases.shift()();
  await drain(h.clock);
  assert.deepEqual(plainValue(await first), { regionId: 66, regionName: 'Sparta' });
  assert.deepEqual(plainValue(await second), { regionId: 66, regionName: 'Sparta' });
  assert.equal(h.fetchScript.calls.length, 1, 'no second fetch after settling');
});

// ---------------------------------------------------------------------------
// client concurrency
// ---------------------------------------------------------------------------

test('client concurrency: five queued unique lookups never exceed two active fetches', async () => {
  const h = createHarness();
  const releases = [];
  h.fetchScript.on(() => true, () => new Promise((resolve) => {
    releases.push(() => resolve(jsonResponse({ html: SPARTA_HTML })));
  }));

  const promises = [];
  for (let i = 1; i <= 5; i += 1) promises.push(h.client.resolve(i, -i, WORLD_ORIGIN));

  await drain(h.clock);
  assert.equal(h.fetchScript.calls.length, 2, 'first two lookups start');
  assert.equal(h.fetchScript.getActive(), 2, 'exactly two active requests');
  assert.ok(
    h.fetchScript.getMaxActive() <= h.api.constants.MAX_CONCURRENT,
    'active requests never exceed MAX_CONCURRENT',
  );

  for (let i = 0; i < 5; i += 1) {
    assert.ok(releases.length > 0, 'a hanging request must be available to release');
    releases.shift()();
    await drain(h.clock);
    assert.ok(h.fetchScript.getActive() <= 2, 'active count stays bounded');
  }

  const values = await Promise.all(promises);
  for (const value of values) {
    assert.deepEqual(plainValue(value), { regionId: 66, regionName: 'Sparta' });
  }
  assert.equal(h.fetchScript.calls.length, 5, 'all five unique lookups were sent');
  assert.equal(h.fetchScript.getMaxActive(), 2, 'peak concurrency was exactly MAX_CONCURRENT');
});

// ---------------------------------------------------------------------------
// client spacing
// ---------------------------------------------------------------------------

test('client spacing: request starts are at least 300 ms apart on the injected clock', async () => {
  const h = createHarness();
  h.fetchScript.on(() => true, () => jsonResponse({ html: SPARTA_HTML }));

  const promises = [
    h.client.resolve(1, 1, WORLD_ORIGIN),
    h.client.resolve(2, 2, WORLD_ORIGIN),
    h.client.resolve(3, 3, WORLD_ORIGIN),
  ];
  await drain(h.clock);
  const values = await Promise.all(promises);
  for (const value of values) {
    assert.deepEqual(plainValue(value), { regionId: 66, regionName: 'Sparta' });
  }

  const starts = h.fetchScript.calls.map((call) => call.startedAt);
  assert.deepEqual(starts, [0, 300, 600]);
  for (let i = 1; i < starts.length; i += 1) {
    assert.ok(
      starts[i] - starts[i - 1] >= h.api.constants.MIN_START_GAP_MS,
      `request ${i} must start at least MIN_START_GAP_MS after request ${i - 1}`,
    );
  }
});

// ---------------------------------------------------------------------------
// client cache ttl
// ---------------------------------------------------------------------------

test('client cache ttl: fresh hits avoid fetch for 24h and expired entries refresh', async () => {
  const h = createHarness();
  h.fetchScript.on(() => true, () => jsonResponse({ html: SPARTA_HTML }));

  const first = h.client.resolve(89, -97, WORLD_ORIGIN);
  await drain(h.clock);
  assert.deepEqual(plainValue(await first), { regionId: 66, regionName: 'Sparta' });
  assert.equal(h.fetchScript.calls.length, 1);

  const key = h.api.makeCacheKey(WORLD_ORIGIN, 89, -97);
  assert.deepEqual(plainValue(h.storage.data.get(key)), {
    v: 1,
    regionId: 66,
    regionName: 'Sparta',
    fetchedAt: 0,
  });

  h.clock.advance(h.api.constants.TTL_MS - 1);
  const second = h.client.resolve(89, -97, WORLD_ORIGIN);
  assert.deepEqual(plainValue(await second), { regionId: 66, regionName: 'Sparta' });
  assert.equal(h.fetchScript.calls.length, 1, 'fresh cache hit must not fetch');
  assert.equal(h.client.getStats().cacheHits, 1);

  h.clock.advance(2);
  const third = h.client.resolve(89, -97, WORLD_ORIGIN);
  await drain(h.clock);
  assert.deepEqual(plainValue(await third), { regionId: 66, regionName: 'Sparta' });
  assert.equal(h.fetchScript.calls.length, 2, 'expired cache entry must refresh');
  assert.equal(h.client.getStats().cacheHits, 1);
});

// ---------------------------------------------------------------------------
// client stale fallback
// ---------------------------------------------------------------------------

test('client stale fallback: failed refresh returns the last-known-good value', async () => {
  const h = createHarness();
  let failing = false;
  h.fetchScript.on(() => true, () =>
    failing ? jsonResponse({ error: 'boom' }, 500) : jsonResponse({ html: SPARTA_HTML }));

  const first = h.client.resolve(89, -97, WORLD_ORIGIN);
  await drain(h.clock);
  assert.deepEqual(plainValue(await first), { regionId: 66, regionName: 'Sparta' });

  h.clock.advance(h.api.constants.TTL_MS + 1);
  failing = true;
  const refresh = h.client.resolve(89, -97, WORLD_ORIGIN);
  await drain(h.clock);
  assert.deepEqual(
    plainValue(await refresh),
    { regionId: 66, regionName: 'Sparta' },
    'stale value must survive a failed refresh',
  );
  assert.equal(h.fetchScript.calls.length, 2, 'refresh was attempted');
  assert.equal(h.storage.setCalls.length, 1, 'stale refresh must not overwrite the cache');
  assert.equal(
    plainValue(h.storage.data.get(h.api.makeCacheKey(WORLD_ORIGIN, 89, -97))).fetchedAt,
    0,
    'cached fetchedAt must not be fabricated',
  );
});

// ---------------------------------------------------------------------------
// client failures
// ---------------------------------------------------------------------------

test('client failures: 500, invalid JSON, missing anchor and network rejection resolve null', async () => {
  const scenarios = [
    { label: 'HTTP 500', handler: () => jsonResponse({ html: SPARTA_HTML }, 500) },
    { label: 'invalid JSON', handler: () => textResponse('<html>login form</html>') },
    {
      label: 'missing region anchor',
      handler: () => jsonResponse({ html: '<div id="village_info"><span>brak</span></div>' }),
    },
    { label: 'network rejection', handler: () => Promise.reject(new TypeError('network down')) },
  ];

  for (const scenario of scenarios) {
    const h = createHarness();
    h.fetchScript.on(() => true, scenario.handler);

    const promise = h.client.resolve(11, -22, WORLD_ORIGIN);
    await drain(h.clock);
    const value = await promise;
    assert.equal(value, null, `${scenario.label} must resolve null`);
    assert.equal(h.fetchScript.calls.length, 1, `${scenario.label} must issue one lookup attempt`);
    assert.equal(h.storage.setCalls.length, 0, `${scenario.label} must not cache anything`);
    assert.equal(h.client.getStats().inFlight, 0, `${scenario.label} must clear in-flight state`);
  }
});

test('client failures: timeout aborts at exactly 10000 ms and resolves null', async () => {
  const h = createHarness();
  h.fetchScript.on(() => true, (call) => hangingResponse(call));

  let settled = false;
  const promise = h.client.resolve(5, -5, WORLD_ORIGIN).then((value) => {
    settled = true;
    return value;
  });
  await flushMicrotasks();
  assert.equal(h.fetchScript.getActive(), 1, 'fetch is hanging');

  h.clock.advance(h.api.constants.TIMEOUT_MS - 1);
  await flushMicrotasks();
  assert.equal(settled, false, 'must not abort before the 10 second timeout');

  h.clock.advance(1);
  await drain(h.clock);
  assert.equal(await promise, null, 'aborted timeout resolves null');
  assert.equal(settled, true);
  assert.equal(h.storage.setCalls.length, 0, 'timeout must not cache anything');
});

// ---------------------------------------------------------------------------
// client cooldown
// ---------------------------------------------------------------------------

test('client cooldown: 401/403/429 halt new lookups for 15 minutes and resume after', async () => {
  for (const status of [401, 403, 429]) {
    const h = createHarness();
    let deny = true;
    h.fetchScript.on(() => true, () =>
      (deny ? jsonResponse({ error: 'denied' }, status) : jsonResponse({ html: SPARTA_HTML })));

    const denied = h.client.resolve(1, 1, WORLD_ORIGIN);
    await drain(h.clock);
    assert.equal(await denied, null, `HTTP ${status} must resolve null without a region`);
    assert.equal(h.fetchScript.calls.length, 1, `HTTP ${status} issues exactly one request`);
    assert.equal(h.storage.setCalls.length, 0, `HTTP ${status} must not cache anything`);

    const stats = h.client.getStats();
    assert.equal(stats.cooldownUntil, h.api.constants.COOLDOWN_MS, `HTTP ${status} sets a 15 minute cooldown`);
    assert.equal(stats.stopped, true, `HTTP ${status} halts lookups during the cooldown`);

    const blocked = await Promise.all([
      h.client.resolve(2, 2, WORLD_ORIGIN),
      h.client.resolve(3, 3, WORLD_ORIGIN),
    ]);
    await drain(h.clock);
    assert.deepEqual(blocked, [null, null], `HTTP ${status} resolves new coordinates null`);
    assert.equal(h.fetchScript.calls.length, 1, `HTTP ${status} must not fetch during cooldown`);
    assert.equal(h.client.getStats().stopped, true, `HTTP ${status} stays halted during cooldown`);

    h.clock.advance(h.api.constants.COOLDOWN_MS + 1);
    assert.equal(h.client.getStats().stopped, false, `HTTP ${status} cooldown expires`);
    deny = false;
    const resumed = h.client.resolve(4, 4, WORLD_ORIGIN);
    await drain(h.clock);
    assert.deepEqual(
      plainValue(await resumed),
      { regionId: 66, regionName: 'Sparta' },
      `HTTP ${status} resumes after the cooldown`,
    );
    assert.equal(h.fetchScript.calls.length, 2, `HTTP ${status} issues a fresh request after cooldown`);
  }
});

// ---------------------------------------------------------------------------
// client cap
// ---------------------------------------------------------------------------

test('client cap: the 51st unique live lookup is not sent and resolves null', async () => {
  const h = createHarness();
  h.fetchScript.on(() => true, () => jsonResponse({ html: SPARTA_HTML }));

  const promises = [];
  for (let i = 0; i < 50; i += 1) promises.push(h.client.resolve(i + 1, -(i + 1), WORLD_ORIGIN));
  const overflow = h.client.resolve(1000, -1000, WORLD_ORIGIN);
  assert.equal(await overflow, null, '51st unique lookup resolves null');

  await drain(h.clock);
  const values = await Promise.all(promises);
  for (const value of values) {
    assert.deepEqual(plainValue(value), { regionId: 66, regionName: 'Sparta' });
  }
  assert.equal(h.fetchScript.calls.length, 50, 'exactly PAGE_CAP requests are sent');
  assert.equal(h.client.getStats().startedCount, 50);

  const cached = await h.client.resolve(1, -1, WORLD_ORIGIN);
  assert.deepEqual(plainValue(cached), { regionId: 66, regionName: 'Sparta' }, 'cached hits still work');
  assert.equal(h.fetchScript.calls.length, 50, 'a cached hit does not count toward the cap');
  assert.equal(h.client.getStats().cacheHits, 1);
});

// ---------------------------------------------------------------------------
// client stop
// ---------------------------------------------------------------------------

test('client stop: aborts in-flight requests, halts the queue and blocks new lookups', async () => {
  const h = createHarness();
  h.fetchScript.on(() => true, (call) => hangingResponse(call));

  const first = h.client.resolve(1, 1, WORLD_ORIGIN);
  await flushMicrotasks();
  assert.equal(h.fetchScript.getActive(), 1);

  h.client.stop();
  assert.equal(h.client.getStats().stopped, true);
  await drain(h.clock);
  assert.equal(await first, null, 'aborted in-flight lookup resolves null');

  const second = await h.client.resolve(2, 2, WORLD_ORIGIN);
  assert.equal(second, null, 'lookups after stop resolve null');
  assert.equal(h.fetchScript.calls.length, 1, 'no requests are issued after stop');
  assert.equal(h.fetchScript.getActive(), 0);
});

// ---------------------------------------------------------------------------
// Todo 4: locale-scoped event discovery and coordinate extraction.
// ---------------------------------------------------------------------------

const NEWS_PAGE_HTML = readFileSync(path.resolve(HERE, '..', 'news.html'), 'utf8');

test('discovery sidebar: news.html yields exactly the three real founding events in document order', () => {
  const { api, document } = loadUserscriptTestApi(NEWS_PAGE_HTML);
  assert.ok(Object.isFrozen(api), '__TRN_TEST_API__ must stay frozen');
  assert.deepEqual(plainValue(api.EVENT_WORDINGS), {
    founding: 'założył(a) nową osadę',
    conquest: 'podbił(a) osadę',
    loss: 'utracił(a) osadę',
  }, 'EVENT_WORDINGS must expose exactly the three approved wordings');

  const descriptors = api.discoverEvents(document);
  assert.equal(descriptors.length, 3, 'only the three real sidebar founding events are accepted');
  assert.deepEqual(
    Array.from(descriptors, (descriptor) => [descriptor.x, descriptor.y]),
    SIDEBAR_EVENTS.map((event) => [Number(event.x), Number(event.y)]),
    'document order and signed coordinates must match the real feed',
  );

  for (const descriptor of descriptors) {
    assert.deepEqual(Object.keys(descriptor).sort(), ['anchor', 'container', 'x', 'y']);
    assert.equal(descriptor.container.tagName, 'LI', 'sidebar events live in li containers');
    assert.ok(descriptor.container.contains(descriptor.anchor), 'anchor must belong to its container');
    assert.ok(
      descriptor.container.closest('#sidebarBoxAlliance'),
      'accepted events must live in the alliance sidebar box',
    );
    assert.equal(
      descriptor.anchor.closest('#sidebarBoxVillageList'),
      null,
      'village list anchors must never be accepted',
    );
    assert.ok(
      descriptor.container.textContent.replace(/\s+/g, ' ').trim().includes('założył(a) nową osadę'),
      'container must keep the founding wording',
    );
  }
});

test('discovery full table: fixture yields one founding, one conquest and one loss descriptor', () => {
  const { api, document } = loadUserscriptTestApi(readFixtureText('alliance-events-full.html'));
  const descriptors = api.discoverEvents(document);
  assert.equal(descriptors.length, 3, 'one descriptor per approved event row');

  const expectations = [
    { wording: EVENT_WORDINGS.founding, x: 89, y: -97 },
    { wording: EVENT_WORDINGS.conquest, x: -139, y: -27 },
    { wording: EVENT_WORDINGS.loss, x: -127, y: -53 },
  ];

  for (let i = 0; i < expectations.length; i += 1) {
    const expectation = expectations[i];
    const descriptor = descriptors[i];
    assert.equal(descriptor.x, expectation.x, `row ${i} must expose x=${expectation.x}`);
    assert.equal(descriptor.y, expectation.y, `row ${i} must expose y=${expectation.y}`);
    assert.equal(descriptor.container.tagName, 'TR', 'full-table events live in tr containers');
    assert.ok(descriptor.container.contains(descriptor.anchor), 'anchor must belong to its row');
    assert.ok(descriptor.anchor.closest('#allianceEvents'), 'row must belong to the alliance events view');
    assert.ok(
      descriptor.container.textContent.replace(/\s+/g, ' ').trim().includes(expectation.wording),
      `row ${i} must keep its ${expectation.wording} wording`,
    );
  }
});

test('discovery false positives: village list, plain map links, bad coordinates and duplicates yield zero descriptors', () => {
  const snippet = [
    '<div id="sidebarBoxVillageList"><ul>',
    '<li class="villageEntry"><a href="/karte.php?x=10&amp;y=20">(10|20)</a> Wioska A</li>',
    '<li class="villageEntry"><a href="/karte.php?x=11&amp;y=21">(11|21)</a> założył(a) nową osadę</li>',
    '</ul></div>',
    '<div id="falsePositiveList"><ul>',
    '<li><a href="/karte.php?d=29754">Mapa</a> założył(a) nową osadę</li>',
    '<li><a href="/karte.php">Mapa</a> założył(a) nową osadę</li>',
    '<li><a href="/karte.php?y=3">Osada</a> założył(a) nową osadę</li>',
    '<li><a href="/karte.php?x=1">Osada</a> podbił(a) osadę</li>',
    '<li><a href="/karte.php?x=1.5&amp;y=2">Osada</a> utracił(a) osadę</li>',
    '<li><a href="/karte.php?x=abc&amp;y=2">Osada</a> założył(a) nową osadę</li>',
    '<li><a href="/karte.php?x=1&amp;x=2&amp;y=3">Osada</a> założył(a) nową osadę</li>',
    '<li><a href="/karte.php?x=1&amp;y=3&amp;y=4">Osada</a> podbił(a) osadę</li>',
    '<li><a href="/karte.php?x=&amp;y=3">Osada</a> założył(a) nową osadę</li>',
    '<li><span class="coordinatesWrapper">(7|8)</span> sam tekst współrzędnych</li>',
    '</ul></div>',
    '<a href="/karte.php?x=5&amp;y=6">(5|6)</a> luźny link bez li/tr',
  ].join('');
  const { api, document } = loadUserscriptTestApi(`<!doctype html><html><body>${snippet}</body></html>`);

  assert.equal(api.discoverEvents(document).length, 0, 'body scan must yield zero descriptors');
  assert.equal(
    api.discoverEvents(document.querySelector('#sidebarBoxVillageList')).length,
    0,
    'village list entries (even with valid coordinates and wording) must yield zero descriptors',
  );
  assert.equal(
    api.discoverEvents(document.querySelector('#falsePositiveList')).length,
    0,
    'plain map links, bad/duplicate coordinates and text-only wrappers must yield zero descriptors',
  );
});

test('discovery duplicates: two events sharing one coordinate stay separate descriptors', () => {
  const markup = [
    '<!doctype html><html><body><ul>',
    '<li>dziś <a href="/profile/1">A</a> założył(a) nową osadę w miejscu <a href="/karte.php?x=89&amp;y=-97">(89|-97)</a>.</li>',
    '<li>dziś <a href="/profile/2">B</a> podbił(a) osadę w miejscu <a href="/karte.php?x=89&amp;y=-97">(89|-97)</a>.</li>',
    '</ul></body></html>',
  ].join('');
  const { api, document } = loadUserscriptTestApi(markup);
  const descriptors = api.discoverEvents(document);

  assert.equal(descriptors.length, 2, 'duplicate coordinates must not collapse render targets');
  assert.deepEqual(Array.from(descriptors, (descriptor) => [descriptor.x, descriptor.y]), [[89, -97], [89, -97]]);
  assert.notEqual(descriptors[0].anchor, descriptors[1].anchor, 'each event keeps its own anchor');
  assert.notEqual(descriptors[0].container, descriptors[1].container, 'each event keeps its own container');
});

test('discovery encoded ampersand: entity markup and wrapped wording still yield the right coordinates', () => {
  const markup = [
    '<!doctype html><html><body><ul>',
    '<li>dziś <a href="/karte.php?x=89&amp;y=-97&amp;d=29754">(89|-97)</a> założył(a)',
    '    nową osadę.</li>',
    '</ul></body></html>',
  ].join('\n');
  const { api, document } = loadUserscriptTestApi(markup);
  const descriptors = api.discoverEvents(document);

  assert.equal(descriptors.length, 1);
  assert.equal(descriptors[0].x, 89);
  assert.equal(descriptors[0].y, -97);
  assert.equal(
    descriptors[0].anchor.getAttribute('href'),
    '/karte.php?x=89&y=-97&d=29754',
    'DOM must normalize &amp; before coordinate parsing',
  );
  assert.equal(descriptors[0].container.tagName, 'LI');
});

// ---------------------------------------------------------------------------
// Todo 5: RegionEventLabel rendering, idempotency and the safe observer.
// ---------------------------------------------------------------------------

const HARNESS_HTML = readFixtureText('visual-harness.html');

function makeRenderHarness(markup = HARNESS_HTML, handler = () => jsonResponse({ html: SPARTA_HTML })) {
  const page = loadUserscriptTestApi(markup);
  const h = createHarness({ api: page.api });
  h.fetchScript.on(() => true, handler);
  return { page, ...h };
}

function snapshotAnchor(anchor) {
  return {
    attrs: Array.from(anchor.attributes, (attribute) => [attribute.name, attribute.value]),
    html: anchor.innerHTML,
  };
}

function assertAnchorUntouched(anchor, snapshot, stateValue) {
  for (const [name, value] of snapshot.attrs) {
    assert.equal(anchor.getAttribute(name), value, `native attribute ${name} must stay unchanged`);
  }
  const expectedNames = snapshot.attrs.map(([name]) => name).concat('data-trn-state').sort();
  const actualNames = Array.from(anchor.attributes, (attribute) => attribute.name).sort();
  assert.deepEqual(actualNames, expectedNames, 'only data-trn-state may be added to the coordinate anchor');
  assert.equal(anchor.innerHTML, snapshot.html, 'native coordinate anchor content must stay unchanged');
  assert.equal(anchor.getAttribute('style'), null, 'no inline style may be added to the coordinate anchor');
  if (stateValue !== undefined) assert.equal(anchor.getAttribute('data-trn-state'), stateValue);
}

test('render initial scan: visual-harness gets one adjacent label per accepted event', async () => {
  const { page, client, clock, fetchScript } = makeRenderHarness();
  assert.ok(Object.isFrozen(page.api), '__TRN_TEST_API__ must stay frozen');
  assert.equal(page.api.LABEL_CLASS, 'trn-region-label');
  assert.equal(page.api.ANCHOR_STATE_ATTR, 'data-trn-state');

  const descriptors = page.api.discoverEvents(page.document);
  assert.equal(descriptors.length, 6, 'harness exposes three sidebar + three table events');
  const snapshots = descriptors.map((descriptor) => snapshotAnchor(descriptor.anchor));

  const enrichPromise = page.api.enrichEvents(page.document, client, WORLD_ORIGIN);
  await drain(clock);
  assert.equal(await enrichPromise, 6, 'one label per accepted event');
  assert.equal(fetchScript.calls.length, 3, 'three unique coordinates deduplicate network lookups');

  assert.equal(page.document.querySelectorAll('.trn-region-label').length, 6);
  descriptors.forEach((descriptor, index) => {
    const label = descriptor.anchor.nextElementSibling;
    assert.ok(label, `event ${index} must have an immediate next sibling`);
    assert.equal(label.className, 'trn-region-label');
    assert.equal(label.getAttribute('data-trn-region-id'), '66');
    assert.equal(label.getAttribute('style'), null, 'label must not carry inline styles');
    const link = label.querySelector('a');
    assert.equal(link.getAttribute('href'), '/region/66');
    assert.equal(link.textContent, 'Sparta');
    assert.equal(label.textContent, ' — Sparta');
    assertAnchorUntouched(descriptor.anchor, snapshots[index], 'resolved');
  });
});

test('render idempotent: a second enrich pass inserts nothing and fetches nothing', async () => {
  const { page, client, clock, fetchScript } = makeRenderHarness();

  const firstPromise = page.api.enrichEvents(page.document, client, WORLD_ORIGIN);
  await drain(clock);
  assert.equal(await firstPromise, 6);
  assert.equal(page.document.querySelectorAll('.trn-region-label').length, 6);
  const fetchesAfterFirst = fetchScript.calls.length;

  const secondResult = await page.api.enrichEvents(page.document, client, WORLD_ORIGIN);
  assert.equal(secondResult, 0, 'second pass inserts zero labels');
  assert.equal(page.document.querySelectorAll('.trn-region-label').length, 6, 'label count is unchanged');
  assert.equal(fetchScript.calls.length, fetchesAfterFirst, 'second pass issues no fetch');
});

test('render observer replacement: replaced lists are re-annotated from cache with zero new fetches', async () => {
  const { page, client, clock, fetchScript } = makeRenderHarness();

  const pristineList = page.document.querySelector('#sidebarBoxAlliance ul').cloneNode(true);
  const pristineBody = page.document.querySelector('#allianceEvents tbody').cloneNode(true);

  const initialPromise = page.api.enrichEvents(page.document, client, WORLD_ORIGIN);
  await drain(clock);
  assert.equal(await initialPromise, 6);
  const fetchesAfterInitial = fetchScript.calls.length;
  assert.equal(fetchesAfterInitial, 3, 'initial pass deduplicates the three coordinates');

  const handle = page.api.createObserver({ client, origin: WORLD_ORIGIN, target: page.document.body });
  page.document.querySelector('#sidebarBoxAlliance ul').replaceWith(pristineList);
  page.document.querySelector('#allianceEvents tbody').replaceWith(pristineBody);

  const flushPromise = handle.flush();
  await drain(clock);
  await flushPromise;

  assert.equal(page.document.querySelectorAll('.trn-region-label').length, 6, 'labels restored on replacement nodes');
  assert.equal(fetchScript.calls.length, fetchesAfterInitial, 'replacement is served from cache');
  const restored = page.document.querySelectorAll(
    '#sidebarBoxAlliance li a[href^="/karte.php"], #allianceEvents tbody a[href^="/karte.php"]',
  );
  assert.equal(restored.length, 6);
  for (const anchor of restored) {
    assert.equal(anchor.getAttribute('data-trn-state'), 'resolved');
    const label = anchor.nextElementSibling;
    assert.ok(label && label.classList && label.classList.contains('trn-region-label'), 'restored anchor needs its label');
    assert.equal(label.querySelector('a').textContent, 'Sparta');
  }
  handle.disconnect();
});

test('render unrelated mutation: unrelated nodes add no labels and no fetches', async () => {
  const { page, client, fetchScript } = makeRenderHarness();
  const handle = page.api.createObserver({ client, origin: WORLD_ORIGIN, target: page.document.body });

  const paragraph = page.document.createElement('p');
  paragraph.textContent = 'zwykły, niepowiązany węzeł';
  page.document.body.appendChild(paragraph);

  await handle.flush();
  assert.equal(page.document.querySelectorAll('.trn-region-label').length, 0, 'no labels for unrelated nodes');
  assert.equal(fetchScript.calls.length, 0, 'no lookups for unrelated nodes');
  handle.disconnect();
});

test('render village list exclusion: village-list coordinate links never get labels', async () => {
  const markup = [
    '<!doctype html><html><body>',
    '<div id="sidebarBoxVillageList"><ul>',
    '<li><a href="/karte.php?x=10&amp;y=20">(10|20)</a> Wioska A</li>',
    '<li><a href="/karte.php?x=11&amp;y=21">(11|21)</a> założył(a) nową osadę</li>',
    '</ul></div>',
    '</body></html>',
  ].join('');
  const page = loadUserscriptTestApi(markup);
  const h = createHarness({ api: page.api });
  h.fetchScript.on(() => true, () => jsonResponse({ html: SPARTA_HTML }));

  const inserted = await page.api.enrichEvents(page.document, h.client, WORLD_ORIGIN);
  assert.equal(inserted, 0, 'no labels may be inserted in the village list');
  assert.equal(page.document.querySelectorAll('.trn-region-label').length, 0);
  assert.equal(h.fetchScript.calls.length, 0, 'village-list coordinates never trigger a lookup');
  const anchors = page.document.querySelectorAll('#sidebarBoxVillageList a[href^="/karte.php"]');
  assert.equal(anchors.length, 2);
  for (const anchor of anchors) {
    assert.equal(anchor.getAttribute('data-trn-state'), null, 'village-list anchors stay untouched');
  }
});

test('render teardown: a disconnected observer never annotates replacements', async () => {
  const { page, client, fetchScript } = makeRenderHarness();
  const pristineList = page.document.querySelector('#sidebarBoxAlliance ul').cloneNode(true);

  const handle = page.api.createObserver({ client, origin: WORLD_ORIGIN, target: page.document.body });
  handle.disconnect();

  page.document.querySelector('#sidebarBoxAlliance ul').replaceWith(pristineList);
  await handle.flush();

  assert.equal(page.document.querySelectorAll('.trn-region-label').length, 0, 'no labels after disconnect');
  assert.equal(fetchScript.calls.length, 0, 'no lookups after disconnect');
});

test('render long name: long region names render once and leave the native anchor intact', async () => {
  const longName = 'RegionBezSpacji'.repeat(14);
  const payloadHtml = '<div id="village_info"><a href="/region/777">' + longName + '</a></div>';
  const { page, client, clock } = makeRenderHarness(HARNESS_HTML, () => jsonResponse({ html: payloadHtml }));

  const anchor = page.document.querySelector('#sidebarBoxAlliance li a[href^="/karte.php"]');
  const snapshot = snapshotAnchor(anchor);

  const enrichPromise = page.api.enrichEvents(anchor.closest('ul'), client, WORLD_ORIGIN);
  await drain(clock);
  assert.equal(await enrichPromise, 3, 'all three sidebar events get a label');

  const label = anchor.nextElementSibling;
  assert.ok(label && label.classList.contains('trn-region-label'));
  assert.equal(label.getAttribute('data-trn-region-id'), '777');
  assert.equal(label.getAttribute('style'), null, 'no inline width/nowrap style on the label');
  const link = label.querySelector('a');
  assert.equal(link.getAttribute('style'), null, 'no inline width/nowrap style on the region link');
  assert.equal(link.getAttribute('href'), '/region/777');
  assert.equal(link.textContent, longName);
  assertAnchorUntouched(anchor, snapshot, 'resolved');
});

test('render failure path: missing region and rejected client leave the native row untouched', async () => {
  const missingHtml = '<div id="village_info"><span>brak regionu dla tej osady</span></div>';
  const { page, client, clock, fetchScript } = makeRenderHarness(HARNESS_HTML, () => jsonResponse({ html: missingHtml }));

  const anchorList = page.document.querySelectorAll('#sidebarBoxAlliance li a[href^="/karte.php"]');
  const anchor = anchorList[0];
  const rejectAnchor = anchorList[1];
  const snapshot = snapshotAnchor(anchor);
  const rejectSnapshot = snapshotAnchor(rejectAnchor);

  const missingPromise = page.api.enrichEvents(anchor.closest('ul'), client, WORLD_ORIGIN);
  await drain(clock);
  assert.equal(await missingPromise, 0, 'missing region inserts no label');
  assert.equal(page.document.querySelectorAll('.trn-region-label').length, 0);
  assert.equal(anchor.getAttribute('data-trn-state'), 'failed');
  assert.equal(anchor.nextElementSibling, null, 'no label follows the failed anchor');
  assertAnchorUntouched(anchor, snapshot, 'failed');
  assert.equal(fetchScript.calls.length, 3, 'each sidebar coordinate was looked up once');

  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  let insertedOnReject = null;
  try {
    const rejectingClient = { resolve: () => Promise.reject(new Error('client rejected')) };
    insertedOnReject = await page.api.enrichEvents(rejectAnchor.closest('ul'), rejectingClient, WORLD_ORIGIN);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.equal(insertedOnReject, 0, 'rejected client inserts no label');
  assert.equal(unhandled.length, 0, 'enrichEvents must never leak an unhandled rejection');
  assert.equal(rejectAnchor.getAttribute('data-trn-state'), 'failed');
  assert.equal(rejectAnchor.nextElementSibling, null, 'no label follows the rejected anchor');
  assertAnchorUntouched(rejectAnchor, rejectSnapshot, 'failed');
});

// ---------------------------------------------------------------------------
// Todo 6: startup integration, unload teardown and end-to-end regression.
// ---------------------------------------------------------------------------

const EVIDENCE_DIR = path.resolve(HERE, '..', '.omo', 'evidence');
const FAILURE_MATRIX_EVIDENCE_PATH = path.join(
  EVIDENCE_DIR,
  'task-6-travian-region-news-userscript-failure.json',
);

async function waitFor(predicate, timeoutMs = 8000, intervalMs = 25) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() > deadline) throw new Error(`waitFor timed out after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function anchorOuterHtmlWithoutState(anchor) {
  const clone = anchor.cloneNode(true);
  clone.removeAttribute('data-trn-state');
  return clone.outerHTML;
}

function containerOuterHtmlWithoutState(container) {
  const clone = container.cloneNode(true);
  clone.querySelectorAll('[data-trn-state]').forEach((element) => element.removeAttribute('data-trn-state'));
  return clone.outerHTML;
}

function findAnchor(documentRef, href) {
  return Array.from(documentRef.querySelectorAll('a[href^="/karte.php"]')).find(
    (anchor) => anchor.getAttribute('href') === href,
  ) || null;
}

function bootProductionPage({ seed = {}, countObservers = false } = {}) {
  const dom = new JSDOM(readFixtureText('visual-harness.html'), {
    runScripts: 'outside-only',
    url: 'https://cw.x2.international.travian.com/news.php',
  });

  const store = new Map(Object.entries(seed));
  const gmWrites = [];
  dom.window.GM_getValue = (key, fallback) => (store.has(key) ? store.get(key) : fallback);
  dom.window.GM_setValue = (key, value) => {
    gmWrites.push({ key, value });
    store.set(key, value);
  };

  const fetches = [];
  dom.window.fetch = (url, options) => {
    fetches.push({ url: String(url), options });
    return Promise.resolve({ status: 200, json: async () => ({ html: SPARTA_HTML }) });
  };

  const consoleCalls = { warn: [], log: [], error: [] };
  for (const level of Object.keys(consoleCalls)) {
    dom.window.console[level] = (...args) => { consoleCalls[level].push(args); };
  }

  const uncaught = [];
  dom.window.addEventListener('error', (event) => uncaught.push(event.error || event.message));
  dom.window.addEventListener('unhandledrejection', (event) => uncaught.push(event.reason));

  let observerCount = 0;
  if (countObservers) {
    const RealMutationObserver = dom.window.MutationObserver;
    function CountingMutationObserver(callback) {
      observerCount += 1;
      return new RealMutationObserver(callback);
    }
    CountingMutationObserver.prototype = RealMutationObserver.prototype;
    dom.window.MutationObserver = CountingMutationObserver;
  }

  dom.window.eval(readFileSync(USERSCRIPT_PATH, 'utf8'));

  return { dom, store, gmWrites, fetches, consoleCalls, uncaught, getObserverCount: () => observerCount };
}

test('e2e both views: startApp annotates sidebar and full table through one code path', async () => {
  const { page, client, clock, fetchScript } = makeRenderHarness();
  assert.ok(Object.isFrozen(page.api), '__TRN_TEST_API__ must stay frozen');
  assert.equal(page.api.DEBUG, false);
  assert.equal(typeof page.api.startApp, 'function');

  const controller = page.api.startApp({
    window: page.window,
    document: page.document,
    client,
    origin: WORLD_ORIGIN,
    target: page.document.body,
  });
  assert.ok(Object.isFrozen(controller), 'controller must be frozen');
  assert.equal(controller.isActive(), true);

  const flushPromise = controller.flush();
  await drain(clock);
  await flushPromise;

  assert.equal(page.document.querySelectorAll('.trn-region-label').length, 6);
  const sidebarLabels = Array.from(page.document.querySelectorAll('#sidebarBoxAlliance .trn-region-label'));
  const tableLabels = Array.from(page.document.querySelectorAll('#allianceEvents .trn-region-label'));
  assert.equal(sidebarLabels.length, 3, 'sidebar view must be annotated');
  assert.equal(tableLabels.length, 3, 'full-table view must be annotated');
  for (const label of sidebarLabels.concat(tableLabels)) {
    assert.equal(label.querySelector('a').getAttribute('href'), '/region/66');
    assert.equal(label.querySelector('a').textContent, 'Sparta');
  }
  assert.equal(fetchScript.calls.length, 3, 'three unique coordinates through one client');
  controller.stop();
  assert.equal(controller.isActive(), false);
  assert.equal(controller.stop(), undefined, 'stop must be idempotent');
});

test('e2e production bootstrap: real userscript auto-starts, caches only the allowed schema and stays silent', async () => {
  const boot = bootProductionPage();
  const { dom } = boot;
  try {
    assert.equal(dom.window.__TRN_TEST_MODE__, undefined, 'production mode must not be test mode');
    assert.equal(dom.window.__TRN_TEST_API__, undefined, 'production mode must not define the test API');
    assert.ok(dom.window.__TRN_PRODUCTION__, 'production bootstrap must be exposed');
    assert.ok(Object.isFrozen(dom.window.__TRN_PRODUCTION__), 'production bootstrap must be frozen');
    assert.equal(dom.window.__TRN_PRODUCTION__.DEBUG, false);

    await waitFor(() => dom.window.document.querySelectorAll('.trn-region-label').length === 6);
    await waitFor(() => boot.gmWrites.length === 3);

    const anchor89 = findAnchor(dom.window.document, '/karte.php?x=89&y=-97');
    assert.ok(anchor89, 'the verified (89,-97) anchor must exist');
    const label89 = anchor89.nextElementSibling;
    assert.ok(label89 && label89.classList.contains('trn-region-label'));
    assert.equal(label89.querySelector('a').getAttribute('href'), '/region/66');
    assert.equal(label89.querySelector('a').textContent, 'Sparta', 'same-day settlement resolves to Sparta');
    assert.equal(anchor89.getAttribute('data-trn-state'), 'resolved');

    assert.equal(dom.window.document.querySelectorAll('#sidebarBoxAlliance .trn-region-label').length, 3);
    assert.equal(dom.window.document.querySelectorAll('#allianceEvents .trn-region-label').length, 3);
    assert.equal(boot.fetches.length, 3, 'one request per unique coordinate');

    for (const call of boot.fetches) {
      const url = new URL(call.url);
      assert.equal(url.origin, dom.window.location.origin, 'requests must be same-origin');
      assert.equal(url.pathname, '/api/v1/map/tile-details');
      assert.equal(call.options.method, 'POST');
      assert.equal(call.options.credentials, 'same-origin');
    }

    for (const write of boot.gmWrites) {
      assert.deepEqual(Object.keys(write.value).sort(), ['fetchedAt', 'regionId', 'regionName', 'v']);
      assert.equal(write.value.v, 1);
      assert.ok(Number.isSafeInteger(write.value.regionId) && write.value.regionId > 0);
      assert.ok(typeof write.value.regionName === 'string' && write.value.regionName.length > 0);
      assert.ok(Number.isFinite(write.value.fetchedAt));
    }

    assert.deepEqual(boot.consoleCalls.warn, [], 'DEBUG=false must not warn');
    assert.deepEqual(boot.consoleCalls.log, [], 'no console output allowed');
    assert.deepEqual(boot.consoleCalls.error, [], 'no console output allowed');
    assert.deepEqual(boot.uncaught, [], 'zero uncaught errors');
  } finally {
    dom.window.close();
  }
});

test('e2e repeated startup: start() and startApp() are idempotent with a single observer', async () => {
  const boot = bootProductionPage({ countObservers: true });
  const { dom } = boot;
  try {
    await waitFor(() => dom.window.document.querySelectorAll('.trn-region-label').length === 6);
    assert.equal(boot.getObserverCount(), 1, 'exactly one MutationObserver was constructed');

    const labelsBefore = dom.window.document.querySelectorAll('.trn-region-label').length;
    const fetchesBefore = boot.fetches.length;

    const production = dom.window.__TRN_PRODUCTION__;
    production.start();
    production.start();

    const config = {
      window: dom.window,
      document: dom.window.document,
      client: production.client,
      origin: dom.window.location.origin,
      target: dom.window.document.body,
    };
    const firstController = production.startApp(config);
    const secondController = production.startApp(config);
    assert.equal(firstController, secondController, 'the same document returns the same controller');
    assert.equal(firstController.isActive(), true);

    await new Promise((resolve) => setTimeout(resolve, 400));

    assert.equal(
      dom.window.document.querySelectorAll('.trn-region-label').length,
      labelsBefore,
      'no duplicate labels after repeated startup',
    );
    assert.equal(boot.fetches.length, fetchesBefore, 'no extra requests after repeated startup');
    assert.equal(boot.getObserverCount(), 1, 'still exactly one observer');
  } finally {
    dom.window.close();
  }
});

test('e2e unload abort: pagehide aborts pending work and disconnects the observer', async () => {
  const page = loadUserscriptTestApi(HARNESS_HTML);
  const h = createHarness({ api: page.api });
  h.fetchScript.on(() => true, (call) => hangingResponse(call));

  const controller = page.api.startApp({
    window: page.window,
    document: page.document,
    client: h.client,
    origin: WORLD_ORIGIN,
    target: page.document.body,
  });
  await flushMicrotasks();
  h.clock.advance(300);
  await flushMicrotasks();
  assert.equal(h.fetchScript.getActive(), 2, 'two hanging lookups are active');
  assert.equal(controller.isActive(), true);

  page.window.dispatchEvent(new page.window.Event('pagehide'));

  await flushMicrotasks();
  assert.equal(h.fetchScript.getActive(), 0, 'pagehide aborts in-flight requests');
  assert.equal(controller.isActive(), false, 'controller becomes inactive after pagehide');

  const pristineList = page.document.querySelector('#sidebarBoxAlliance ul').cloneNode(true);
  page.document.querySelector('#sidebarBoxAlliance ul').replaceWith(pristineList);
  await drain(h.clock);
  await controller.flush();

  assert.equal(page.document.querySelectorAll('.trn-region-label').length, 0, 'no labels after teardown');
  assert.equal(h.fetchScript.calls.length, 2, 'no new requests after teardown');
});

test('e2e storage corruption: malformed and wrong-version records are discarded and rewritten', async () => {
  const origin = 'https://cw.x2.international.travian.com';
  const seed = {};
  seed[`${origin}:89|-97`] = { v: 99, regionId: 1, regionName: 'Zepsuty', fetchedAt: 0 };
  seed[`${origin}:-139|-27`] = 'not json at all';

  const boot = bootProductionPage({ seed });
  const { dom } = boot;
  try {
    await waitFor(() => dom.window.document.querySelectorAll('.trn-region-label').length === 6);

    const anchor89 = findAnchor(dom.window.document, '/karte.php?x=89&y=-97');
    assert.ok(anchor89, 'the (89,-97) anchor must exist');
    const label89 = anchor89.nextElementSibling;
    assert.ok(label89 && label89.classList.contains('trn-region-label'));
    assert.equal(label89.querySelector('a').textContent, 'Sparta', 'corrupt cache must not leak a fabricated name');

    const record = boot.store.get(`${origin}:89|-97`);
    assert.ok(record, 'a valid record must be rewritten');
    assert.deepEqual(Object.keys(record).sort(), ['fetchedAt', 'regionId', 'regionName', 'v']);
    assert.equal(record.v, 1);
    assert.equal(record.regionId, 66);
    assert.equal(record.regionName, 'Sparta');
    assert.ok(Number.isFinite(record.fetchedAt));
    assert.equal(boot.fetches.length, 3, 'corrupt entries are refreshed from the network');
  } finally {
    dom.window.close();
  }
});

test('e2e storage write failure: a throwing storage.set still renders labels without unhandled rejections', async () => {
  const page = loadUserscriptTestApi(HARNESS_HTML);
  const clock = createFakeClock();
  const storage = {
    get: () => undefined,
    set: () => { throw new Error('quota exceeded'); },
  };
  const h = createHarness({ api: page.api, clock, storage });
  h.fetchScript.on(() => true, () => jsonResponse({ html: SPARTA_HTML }));

  const uncaught = [];
  const onUnhandled = (reason) => { uncaught.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  let controller = null;
  try {
    controller = page.api.startApp({
      window: page.window,
      document: page.document,
      client: h.client,
      origin: WORLD_ORIGIN,
      target: page.document.body,
    });
    const flushPromise = controller.flush();
    await drain(clock);
    await flushPromise;
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }

  assert.equal(page.document.querySelectorAll('.trn-region-label').length, 6, 'labels appear despite storage failure');
  assert.equal(h.fetchScript.calls.length, 3);
  assert.equal(uncaught.length, 0, 'storage failure must not leak unhandled rejections');
  controller.stop();
});

test('e2e failure matrix: isolated failures leave the native DOM untouched', async () => {
  const scenarios = [
    {
      name: 'login HTML',
      handler: () => textResponse('<html><body><form id="login" action="/login"></form></body></html>'),
    },
    { name: 'non-JSON body', handler: () => textResponse('{"html":') },
    { name: 'HTTP 500', handler: () => jsonResponse({ html: SPARTA_HTML }, 500) },
    { name: 'HTTP 429', handler: () => jsonResponse({ error: 'rate limited' }, 429) },
    { name: 'timeout', handler: (call) => hangingResponse(call) },
    {
      name: 'missing-region payload',
      handler: () => jsonResponse({ html: '<div id="village_info"><span>brak</span></div>' }),
    },
  ];
  const records = [];

  for (const scenario of scenarios) {
    const page = loadUserscriptTestApi(HARNESS_HTML);
    const h = createHarness({ api: page.api });
    h.fetchScript.on(() => true, scenario.handler);

    const anchor = page.document.querySelector('#sidebarBoxAlliance li a[href^="/karte.php"]');
    const container = anchor.closest('li');
    const anchorBefore = anchor.outerHTML;
    const containerBefore = containerOuterHtmlWithoutState(container);

    const uncaught = [];
    const onUnhandled = (reason) => { uncaught.push(reason); };
    page.window.addEventListener('error', (event) => uncaught.push(event.error || event.message));
    process.on('unhandledRejection', onUnhandled);

    let controller = null;
    try {
      controller = page.api.startApp({
        window: page.window,
        document: page.document,
        client: h.client,
        origin: WORLD_ORIGIN,
        target: page.document.body,
      });
      const flushPromise = controller.flush();
      await drain(h.clock);
      await flushPromise;
      await new Promise((resolve) => setImmediate(resolve));

      const fetchCount = h.fetchScript.calls.length;
      const cooldownActive = h.client.getStats().stopped;
      let fetchCountAfterCooldownAttempt = null;

      if (scenario.name === 'HTTP 429') {
        const extra = page.document.createElement('ul');
        extra.innerHTML = '<li><a href="/karte.php?x=777&amp;y=888">(777|888)</a> założył(a) nową osadę</li>';
        const inserted = await page.api.enrichEvents(extra, h.client, WORLD_ORIGIN);
        assert.equal(inserted, 0, 'cooldown must insert no label');
        fetchCountAfterCooldownAttempt = h.fetchScript.calls.length;
        assert.equal(fetchCountAfterCooldownAttempt, fetchCount, '429 cooldown must block further fetches');
        assert.equal(cooldownActive, true, '429 must start the cooldown');
      } else {
        assert.equal(cooldownActive, false, `${scenario.name} must not start a cooldown`);
      }

      const labelCount = page.document.querySelectorAll('.trn-region-label').length;
      assert.equal(labelCount, 0, `${scenario.name} must render no label`);
      assert.equal(uncaught.length, 0, `${scenario.name} must have zero uncaught errors`);
      assert.equal(anchorOuterHtmlWithoutState(anchor), anchorBefore, `${scenario.name} must leave the anchor unchanged`);
      assert.equal(
        containerOuterHtmlWithoutState(container),
        containerBefore,
        `${scenario.name} must leave the container unchanged`,
      );
      assert.equal(anchor.getAttribute('data-trn-state'), 'failed', `${scenario.name} marks the anchor failed`);

      records.push({
        scenario: scenario.name,
        fetchCount,
        domSnapshot: {
          coordinateAnchor: anchorOuterHtmlWithoutState(anchor),
          container: containerOuterHtmlWithoutState(container),
        },
        labelCount,
        uncaughtErrors: uncaught.length,
        cooldownActive,
        anchorState: anchor.getAttribute('data-trn-state'),
        ...(fetchCountAfterCooldownAttempt === null ? {} : { fetchCountAfterCooldownAttempt }),
      });
    } finally {
      process.off('unhandledRejection', onUnhandled);
      if (controller) controller.stop();
    }
  }

  for (const record of records) {
    assert.equal(record.uncaughtErrors, 0, `${record.scenario} evidence must record zero uncaught errors`);
  }
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(FAILURE_MATRIX_EVIDENCE_PATH, `${JSON.stringify(records, null, 2)}\n`);
});

// ---------------------------------------------------------------------------
// F2-01 regression: detached anchor during an in-flight lookup.
// ---------------------------------------------------------------------------

function buildEventList(page, wording, x, y) {
  const root = page.document.createElement('ul');
  const li = page.document.createElement('li');
  li.innerHTML = `dziś <a href="/profile/9">Tester</a> ${wording} w miejscu <a href="/karte.php?x=${x}&amp;y=${y}">(${x}|${y})</a>.`;
  root.appendChild(li);
  return { root, li, anchor: li.querySelector('a[href^="/karte.php"]') };
}

test('render detach during lookup: a detached anchor neither throws nor rejects', async () => {
  const page = loadUserscriptTestApi('<!doctype html><html><body></body></html>');
  const h = createHarness({ api: page.api });
  const releases = [];
  h.fetchScript.on(() => true, () => new Promise((resolve) => {
    releases.push(() => resolve(jsonResponse({ html: SPARTA_HTML })));
  }));

  const handle = page.api.createObserver({ client: h.client, origin: WORLD_ORIGIN, target: page.document.body });
  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  try {
    const event = buildEventList(page, 'założył(a) nową osadę', 89, -97);
    page.document.body.appendChild(event.root);
    await flushMicrotasks();
    assert.equal(h.fetchScript.calls.length, 1, 'the lookup started');

    event.li.remove();
    event.anchor.remove();
    assert.equal(event.anchor.parentNode, null, 'the coordinate anchor parent is gone');
    assert.equal(event.anchor.isConnected, false, 'the coordinate anchor is detached');

    releases.shift()();
    await drain(h.clock);
    assert.equal(unhandled.length, 0, 'detaching must not leak unhandled rejections');

    await handle.flush();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(page.document.querySelectorAll('.trn-region-label').length, 0, 'no label for a detached event');
  } finally {
    process.off('unhandledRejection', onUnhandled);
    handle.disconnect();
  }
});

test('render observer survives detach: later roots are still enriched after a failure', async () => {
  const page = loadUserscriptTestApi('<!doctype html><html><body></body></html>');
  const h = createHarness({ api: page.api });
  const releases = [];
  h.fetchScript.on(() => true, (call) => {
    if (call.x === 55) return jsonResponse({ html: SPARTA_HTML });
    return new Promise((resolve) => {
      releases.push(() => resolve(jsonResponse({ html: SPARTA_HTML })));
    });
  });

  const handle = page.api.createObserver({ client: h.client, origin: WORLD_ORIGIN, target: page.document.body });
  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  try {
    const first = buildEventList(page, 'założył(a) nową osadę', 89, -97);
    page.document.body.appendChild(first.root);
    await flushMicrotasks();
    first.li.remove();
    first.anchor.remove();
    assert.equal(first.anchor.parentNode, null, 'the coordinate anchor parent is gone');
    releases.shift()();
    await drain(h.clock);

    const second = buildEventList(page, 'podbił(a) osadę', 55, -55);
    page.document.body.appendChild(second.root);
    await flushMicrotasks();
    await drain(h.clock);

    const label = second.anchor.nextElementSibling;
    assert.ok(label && label.classList.contains('trn-region-label'), 'the later root must still be enriched');
    assert.equal(label.querySelector('a').getAttribute('href'), '/region/66');
    assert.equal(second.anchor.getAttribute('data-trn-state'), 'resolved');
    assert.equal(page.document.querySelectorAll('.trn-region-label').length, 1, 'only the attached event is labeled');

    await handle.flush();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(unhandled.length, 0, 'no unhandled rejections');
  } finally {
    process.off('unhandledRejection', onUnhandled);
    handle.disconnect();
  }
});

test('render enrich detached no-throw: direct enrich resolves and inserts nothing for a detached container', async () => {
  const page = loadUserscriptTestApi('<!doctype html><html><body></body></html>');
  const h = createHarness({ api: page.api });
  const releases = [];
  h.fetchScript.on(() => true, () => new Promise((resolve) => {
    releases.push(() => resolve(jsonResponse({ html: SPARTA_HTML })));
  }));

  const event = buildEventList(page, 'utracił(a) osadę', -127, -53);
  page.document.body.appendChild(event.root);

  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  let inserted = null;
  try {
    const enrichPromise = page.api.enrichEvents(event.root, h.client, WORLD_ORIGIN);
    await flushMicrotasks();
    assert.equal(h.fetchScript.calls.length, 1, 'the lookup started');

    event.li.remove();
    event.anchor.remove();
    assert.equal(event.anchor.parentNode, null, 'the coordinate anchor parent is gone');
    assert.equal(event.anchor.isConnected, false, 'the coordinate anchor is detached');

    releases.shift()();
    await drain(h.clock);
    inserted = await enrichPromise;
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }

  assert.equal(inserted, 0, 'a detached container must insert nothing');
  assert.equal(page.document.querySelectorAll('.trn-region-label').length, 0);
  assert.equal(unhandled.length, 0, 'direct enrichment must not leak unhandled rejections');
});
