#!/usr/bin/env node
/**
 * Todo 8 — local functional + visual QA for `travian-region-news.user.js`.
 *
 * This driver never talks to the live game. It expects the offline harness to be
 * served from the project root:
 *
 *   python3 -m http.server 4173        # run from the project root
 *   node tests/browser/visual-qa.mjs
 *
 * What it does:
 *   1. happy path at 375 / 768 / 1280 px — stubs same-origin
 *      POST /api/v1/map/tile-details and GM_getValue/GM_setValue in-page, evaluates
 *      the REAL userscript in production mode (`__TRN_TEST_MODE__` is never set),
 *      then asserts label counts, link targets, native anchor preservation,
 *      layout containment, wrapping, replacement/pagination re-render, duplicate
 *      prevention, keyboard focus, zero console/page errors and a local-only
 *      network log.
 *   2. failure runs (separate browser contexts): HTTP 429, malformed/non-JSON
 *      body, and a JSON body without a region anchor — the page must stay native
 *      with zero labels and zero console/page errors.
 *
 * Playwright is deliberately NOT a project dependency. The driver loads it from a
 * throwaway install outside the repo (default `/tmp/trn-qa`) and falls back to a
 * normal 'playwright' resolution.
 *
 * Artifacts (required by the plan):
 *   .omo/evidence/task-8-travian-region-news-userscript-{375,768,1280}.png
 *   .omo/evidence/task-8-travian-region-news-userscript-{375,768,1280}.json
 *   .omo/evidence/task-8-travian-region-news-userscript-failure.json
 * plus pre-enrichment baseline screenshots and failure screenshots.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..', '..');
const USERSCRIPT_PATH = path.join(PROJECT_ROOT, 'travian-region-news.user.js');
const EVIDENCE_DIR = path.join(PROJECT_ROOT, '.omo', 'evidence');
const HARNESS_PATH = 'tests/fixtures/visual-harness.html';
const BASE_URL = process.env.TRN_BASE_URL || 'http://127.0.0.1:4173/' + HARNESS_PATH;
const LOCAL_ORIGIN = new URL(BASE_URL).origin;
const WIDTHS = [375, 768, 1280];
const VIEWPORT_HEIGHT = 900;
const EXPECTED = { total: 7, sidebar: 4, table: 3 };

const LONG_REGION_NAME = 'Wielka Północno-Zachodnia Kraina Górnośląskiego Okręgu Przemysłowego';
const REGIONS = {
  '89,-97': { id: 66, name: 'Sparta' },
  '-139,-27': { id: 8, name: 'Numantia' },
  '-127,-53': { id: 32, name: 'Cherusci' },
  '12,34': { id: 99, name: LONG_REGION_NAME },
};
const SIDEBAR_KEYS = ['89,-97', '-139,-27', '-127,-53', '12,34'];
const TABLE_KEYS = ['89,-97', '-139,-27', '-127,-53'];
const ALL_KEYS = Object.keys(REGIONS);

/* Extra sidebar event injected via page.evaluate (fixtures stay untouched). */
const EXTRA_ROW_HTML =
  'dziś, 05:11 <a href="/profile/404">Gracz4</a> podbił(a) osadę w miejscu ' +
  '<a class="mapCoords" href="/karte.php?x=12&amp;y=34">' +
  '<span class="coordinates coordinatesWrapper"><span class="coordinateX">(12</span>' +
  '<span class="coordinatePipe">|</span><span class="coordinateY">34)</span></span></a>.';

const FAILURE_SCENARIOS = ['http-429', 'malformed-json', 'missing-region'];

/* ------------------------------------------------------------------------ */
/* helpers                                                                  */
/* ------------------------------------------------------------------------ */

function evidencePath(name) {
  return path.join(EVIDENCE_DIR, name);
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function regionHtml(region) {
  return '<div id="village_info"><a href="/region/' + region.id + '">' + escapeHtml(region.name) + '</a></div>';
}

function buildHappyResponses() {
  const responses = {};
  for (const key of ALL_KEYS) responses[key] = { payload: { html: regionHtml(REGIONS[key]) } };
  return responses;
}

function buildHarnessSeed() {
  const seed = {};
  for (const key of ALL_KEYS) seed[key] = { html: regionHtml(REGIONS[key]) };
  return seed;
}

function buildFailureResponses(scenario) {
  const responses = {};
  for (const key of ALL_KEYS) {
    if (scenario === 'http-429') {
      responses[key] = { status: 429, body: '{"error":"too many requests"}', contentType: 'application/json; charset=UTF-8' };
    } else if (scenario === 'malformed-json') {
      responses[key] = { raw: '<html><body>login form, not JSON at all</body></html>', contentType: 'text/html; charset=UTF-8' };
    } else if (scenario === 'missing-region') {
      responses[key] = { payload: { html: '<div id="village_info"><a href="/alliance">Sojusz bez regionu</a></div>' } };
    } else {
      throw new Error('unknown failure scenario: ' + scenario);
    }
  }
  return responses;
}

function expectedRegionForHref(href) {
  try {
    const url = new URL(href, 'http://harness.invalid');
    const key = url.searchParams.get('x') + ',' + url.searchParams.get('y');
    return REGIONS[key] || null;
  } catch (error) {
    return null;
  }
}

async function loadPlaywright() {
  const candidates = [
    process.env.TRN_PLAYWRIGHT,
    '/tmp/trn-qa/node_modules/playwright/index.mjs',
  ].filter(Boolean);
  const failures = [];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      failures.push(candidate + ' (missing)');
      continue;
    }
    try {
      return await import(pathToFileURL(candidate).href);
    } catch (error) {
      failures.push(candidate + ' (' + error.message + ')');
    }
  }
  try {
    return await import('playwright');
  } catch (error) {
    failures.push("'playwright' (" + error.message + ')');
  }
  throw new Error('Playwright could not be loaded: ' + failures.join(' | '));
}

async function launchChrome(playwright) {
  const attempts = [];
  const systemChrome = process.env.TRN_CHROME || '/usr/bin/google-chrome';
  if (existsSync(systemChrome)) {
    attempts.push({ label: 'executablePath=' + systemChrome, options: { executablePath: systemChrome } });
  }
  attempts.push({ label: 'channel=chrome', options: { channel: 'chrome' } });
  attempts.push({ label: 'bundled chromium', options: {} });

  const errors = [];
  for (const attempt of attempts) {
    try {
      const browser = await playwright.chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
        ...attempt.options,
      });
      return { browser, launchMode: attempt.label };
    } catch (error) {
      errors.push(attempt.label + ': ' + (error && error.message ? error.message : String(error)));
    }
  }
  throw new Error('Chrome failed to launch. Attempts -> ' + errors.join(' | '));
}

function attachCollectors(page) {
  const collectors = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requests: [],
    requestFailures: [],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') collectors.consoleErrors.push(message.text());
    else if (message.type() === 'warning') collectors.consoleWarnings.push(message.text());
  });
  page.on('pageerror', (error) => collectors.pageErrors.push(String((error && error.stack) || error)));
  page.on('request', (request) => {
    collectors.requests.push({
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      isNavigationRequest: request.isNavigationRequest(),
    });
  });
  page.on('requestfailed', (request) => {
    collectors.requestFailures.push({
      url: request.url(),
      failure: request.failure() ? request.failure().errorText : 'unknown',
    });
  });
  return collectors;
}

/* ------------------------------------------------------------------------ */
/* in-page functions (serialized by Playwright — must be self-contained)     */
/* ------------------------------------------------------------------------ */

/**
 * Runs before any page script: in-memory GM storage + a fetch wrapper that
 * answers same-origin /api/v1/map/tile-details POSTs locally. Unknown keys are
 * answered locally too (never a network fallback for that endpoint).
 */
function pageInitStub(arg) {
  const responses = arg.responses || {};
  const memory = new Map();
  window.__TRN_QA_TILE_CALLS__ = [];
  window.__TRN_QA_UNEXPECTED_TILE__ = [];
  window.__TRN_HARNESS_TILE_RESPONSES__ = arg.harnessSeed || {};
  window.GM_getValue = function (key, fallback) {
    return memory.has(key) ? memory.get(key) : fallback;
  };
  window.GM_setValue = function (key, value) {
    memory.set(key, value);
  };
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const options = init || {};
    const rawUrl = input && typeof input === 'object' && 'url' in input ? input.url : input;
    const url = String(rawUrl);
    const method = String(options.method || (input && input.method) || 'GET').toUpperCase();
    if (url.indexOf('/api/v1/map/tile-details') !== -1 && method === 'POST') {
      let coordinates = null;
      try {
        coordinates = JSON.parse(String(options.body));
      } catch (error) {
        coordinates = null;
      }
      const key = coordinates ? String(coordinates.x) + ',' + String(coordinates.y) : 'invalid-body';
      window.__TRN_QA_TILE_CALLS__.push({ key: key, url: url, method: method, at: Date.now() });
      const spec = responses[key];
      const jsonHeaders = { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' };
      if (!spec) {
        window.__TRN_QA_UNEXPECTED_TILE__.push(key);
        return Promise.resolve(new Response('{"html":""}', { status: 200, headers: jsonHeaders }));
      }
      if (spec.status && spec.status !== 200) {
        return Promise.resolve(new Response(spec.body === undefined ? '' : spec.body, {
          status: spec.status,
          headers: { 'Content-Type': spec.contentType || 'application/json; charset=UTF-8' },
        }));
      }
      if (spec.raw !== undefined) {
        return Promise.resolve(new Response(spec.raw, {
          status: 200,
          headers: { 'Content-Type': spec.contentType || 'text/plain; charset=UTF-8' },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify(spec.payload === undefined ? { html: '' } : spec.payload), {
        status: 200,
        headers: jsonHeaders,
      }));
    }
    return realFetch(input, init);
  };
}

/** Inject the extra long-name event and capture pre-enrichment snapshots. */
function seedExtraRow(arg) {
  const ul = document.querySelector('#sidebarBoxAlliance .content ul');
  const tbody = document.querySelector('#allianceEvents tbody');
  const li = document.createElement('li');
  // static QA fixture markup authored by this driver; not page/user input.
  li.innerHTML = arg.extraRowHtml;
  ul.appendChild(li);

  function snapshotAnchors() {
    return Array.from(document.querySelectorAll('a[href]'))
      .filter(function (anchor) {
        return (anchor.getAttribute('href') || '').indexOf('/karte.php') !== -1;
      })
      .map(function (anchor) {
        const clone = anchor.cloneNode(true);
        clone.removeAttribute('data-trn-state');
        return {
          href: anchor.getAttribute('href'),
          text: anchor.textContent,
          html: clone.outerHTML,
          attrs: Array.from(anchor.attributes)
            .filter(function (attribute) { return attribute.name !== 'data-trn-state'; })
            .map(function (attribute) { return attribute.name + '=' + attribute.value; })
            .sort(),
        };
      });
  }

  window.__TRN_QA_PRISTINE__ = { sidebarUl: ul.innerHTML, tbody: tbody.innerHTML };
  return {
    anchorCount: snapshotAnchors().length,
    anchors: snapshotAnchors(),
    sidebarHtml: ul.innerHTML,
    sidebarBoxHtml: document.querySelector('#sidebarBoxAlliance').innerHTML,
    tbodyHtml: tbody.innerHTML,
  };
}

/** Full DOM/layout inspection of the enriched page. */
function inspectPageState() {
  const labels = Array.from(document.querySelectorAll('.trn-region-label'));
  const anchors = Array.from(document.querySelectorAll('a[href]')).filter(function (anchor) {
    return (anchor.getAttribute('href') || '').indexOf('/karte.php') !== -1;
  });

  function rectListToData(rectList) {
    return Array.from(rectList).map(function (rect) {
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
  }
  function rectSetsOverlap(setA, setB) {
    for (let a = 0; a < setA.length; a += 1) {
      for (let b = 0; b < setB.length; b += 1) {
        const ra = setA[a];
        const rb = setB[b];
        if (ra.left < rb.right - 0.5 && rb.left < ra.right - 0.5 && ra.top < rb.bottom - 0.5 && rb.top < ra.bottom - 0.5) {
          return true;
        }
      }
    }
    return false;
  }
  /* line-box level overlap: labels against each other and against the trailing
     sentence text node that follows each label (the "." in the harness). */
  const labelLineRects = labels.map(function (label) { return rectListToData(label.getClientRects()); });
  const overlapPairs = [];
  for (let i = 0; i < labelLineRects.length; i += 1) {
    for (let j = i + 1; j < labelLineRects.length; j += 1) {
      if (rectSetsOverlap(labelLineRects[i], labelLineRects[j])) overlapPairs.push([i, j]);
    }
  }
  const tailOverlapIndexes = [];
  labels.forEach(function (label, index) {
    let node = label.nextSibling;
    while (node) {
      if (node.nodeType === 3 && node.textContent.trim().length > 0) {
        const range = label.ownerDocument.createRange();
        range.selectNodeContents(node);
        if (rectSetsOverlap(labelLineRects[index], rectListToData(range.getClientRects()))) {
          tailOverlapIndexes.push(index);
        }
        break;
      }
      node = node.nextSibling;
    }
  });

  return {
    overlapPairs: overlapPairs,
    tailOverlapIndexes: tailOverlapIndexes,
    labelCount: labels.length,
    sidebarLabels: labels.filter(function (label) { return label.closest('#sidebarBoxAlliance'); }).length,
    tableLabels: labels.filter(function (label) { return label.closest('#allianceEvents'); }).length,
    labels: labels.map(function (label) {
      const anchor = label.previousElementSibling;
      const link = label.querySelector('a');
      const container = label.closest('li, tr');
      const labelRect = label.getBoundingClientRect();
      const containerRect = container ? container.getBoundingClientRect() : null;
      return {
        regionId: label.getAttribute('data-trn-region-id'),
        labelText: label.textContent,
        linkHref: link ? link.getAttribute('href') : null,
        linkText: link ? link.textContent : null,
        hasInlineStyle: label.hasAttribute('style'),
        className: label.className,
        anchorHref: anchor ? anchor.getAttribute('href') : null,
        anchorState: anchor ? anchor.getAttribute('data-trn-state') : null,
        containerTag: container ? container.tagName : null,
        scope: label.closest('#sidebarBoxAlliance') ? 'sidebar' : (label.closest('#allianceEvents') ? 'table' : 'other'),
        lineBoxes: link ? link.getClientRects().length : 0,
        insideContainer: !!(
          containerRect &&
          labelRect.left >= containerRect.left - 0.5 &&
          labelRect.right <= containerRect.right + 0.5 &&
          labelRect.top >= containerRect.top - 0.5 &&
          labelRect.bottom <= containerRect.bottom + 0.5
        ),
        rect: {
          left: labelRect.left, right: labelRect.right,
          top: labelRect.top, bottom: labelRect.bottom,
          width: labelRect.width, height: labelRect.height,
        },
        containerRect: containerRect ? {
          left: containerRect.left, right: containerRect.right,
          top: containerRect.top, bottom: containerRect.bottom,
        } : null,
      };
    }),
    anchors: anchors.map(function (anchor, index) {
      const clone = anchor.cloneNode(true);
      clone.removeAttribute('data-trn-state');
      const parent = anchor.parentElement;
      return {
        index: index,
        href: anchor.getAttribute('href'),
        text: anchor.textContent,
        htmlWithoutState: clone.outerHTML,
        attrsWithoutState: Array.from(anchor.attributes)
          .filter(function (attribute) { return attribute.name !== 'data-trn-state'; })
          .map(function (attribute) { return attribute.name + '=' + attribute.value; })
          .sort(),
        state: anchor.getAttribute('data-trn-state'),
        nextSiblingIsLabel: !!(
          anchor.nextElementSibling &&
          anchor.nextElementSibling.classList &&
          anchor.nextElementSibling.classList.contains('trn-region-label')
        ),
        directLabelCount: parent ? parent.querySelectorAll(':scope > .trn-region-label').length : 0,
      };
    }),
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
    outerWidth: window.outerWidth,
    sidebarHtmlStripped: (function () {
      const element = document.querySelector('#sidebarBoxAlliance');
      return element ? element.innerHTML.replace(/\s+data-trn-state="[a-z]+"/g, '') : null;
    })(),
    tbodyHtmlStripped: (function () {
      const element = document.querySelector('#allianceEvents tbody');
      return element ? element.innerHTML.replace(/\s+data-trn-state="[a-z]+"/g, '') : null;
    })(),
  };
}

function readTileCalls() {
  return {
    calls: (window.__TRN_QA_TILE_CALLS__ || []).map(function (call) { return call.key; }),
    unexpected: (window.__TRN_QA_UNEXPECTED_TILE__ || []).slice(),
  };
}

function readProductionStats() {
  try {
    if (window.__TRN_PRODUCTION__ && window.__TRN_PRODUCTION__.client) {
      return window.__TRN_PRODUCTION__.client.getStats();
    }
  } catch (error) {
    return { error: String(error) };
  }
  return null;
}

function replaceBothRoots() {
  const pristine = window.__TRN_QA_PRISTINE__;
  const ul = document.querySelector('#sidebarBoxAlliance .content ul');
  const freshUl = document.createElement('ul');
  freshUl.innerHTML = pristine.sidebarUl;
  ul.replaceWith(freshUl);
  const tbody = document.querySelector('#allianceEvents tbody');
  const freshBody = document.createElement('tbody');
  freshBody.innerHTML = pristine.tbody;
  tbody.replaceWith(freshBody);
  return true;
}

function replaceSidebarWithEnrichedClone() {
  const ul = document.querySelector('#sidebarBoxAlliance .content ul');
  ul.replaceWith(ul.cloneNode(true));
  return true;
}

function runExtraEnrichmentScan() {
  const api = window.__TRN_PRODUCTION__;
  return api.enrichEvents(document.body, api.client, window.location.origin);
}

function focusEveryRegionLink() {
  const links = Array.from(document.querySelectorAll('.trn-region-label a'));
  return links.map(function (link) {
    link.focus();
    return {
      href: link.getAttribute('href'),
      scope: link.closest('#sidebarBoxAlliance') ? 'sidebar' : (link.closest('#allianceEvents') ? 'table' : 'other'),
      active: document.activeElement === link,
    };
  });
}

function blurActiveElement() {
  if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
  return true;
}

function readActiveElement() {
  const element = document.activeElement;
  if (!element || element === document.body) return { tag: 'BODY', regionLink: false, href: null, scope: null };
  return {
    tag: element.tagName,
    href: typeof element.getAttribute === 'function' ? element.getAttribute('href') : null,
    scope: element.closest && element.closest('#sidebarBoxAlliance') ? 'sidebar'
      : (element.closest && element.closest('#allianceEvents') ? 'table' : 'other'),
    regionLink: element.tagName === 'A' && !!(element.closest && element.closest('.trn-region-label')),
  };
}

/* ------------------------------------------------------------------------ */
/* check ledger                                                             */
/* ------------------------------------------------------------------------ */

function createLedger() {
  const checks = [];
  return {
    checks: checks,
    record: function (id, pass, details) {
      checks.push({ id: id, pass: !!pass, details: details === undefined ? null : details });
    },
    failures: function () {
      return checks.filter(function (check) { return !check.pass; });
    },
  };
}

/* ------------------------------------------------------------------------ */
/* happy path                                                               */
/* ------------------------------------------------------------------------ */

async function runHappy(browser, browserDescription, width) {
  const ledger = createLedger();
  const context = await browser.newContext({
    viewport: { width: width, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
  });
  await context.route('**/favicon.ico', function (route) {
    return route.fulfill({ status: 204, body: '' });
  });
  const page = await context.newPage();
  const collectors = attachCollectors(page);

  try {
    await page.addInitScript(pageInitStub, {
      responses: buildHappyResponses(),
      harnessSeed: buildHarnessSeed(),
    });
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.evaluate(function () { return document.fonts.ready.then(function () { return true; }); });

    const pristine = await page.evaluate(seedExtraRow, { extraRowHtml: EXTRA_ROW_HTML });
    ledger.record('seed.extraRow', pristine.anchorCount === EXPECTED.total, {
      anchorCount: pristine.anchorCount,
      expected: EXPECTED.total,
    });

    const nativeScreenshot = 'task-8-travian-region-news-userscript-native-' + width + '.png';
    await page.screenshot({ path: evidencePath(nativeScreenshot), fullPage: true });

    await page.addScriptTag({ path: USERSCRIPT_PATH });
    await page.waitForFunction(function (expected) {
      return document.querySelectorAll('.trn-region-label').length === expected;
    }, EXPECTED.total, { timeout: 25000, polling: 100 });
    await page.waitForFunction(function () {
      const anchors = Array.from(document.querySelectorAll('a[href]')).filter(function (anchor) {
        return (anchor.getAttribute('href') || '').indexOf('/karte.php') !== -1;
      });
      return anchors.length > 0 && anchors.every(function (anchor) {
        return anchor.getAttribute('data-trn-state') === 'resolved';
      });
    }, null, { timeout: 25000, polling: 100 });

    const state = await page.evaluate(inspectPageState);

    /* --- label identity: exactly one linked label per accepted anchor --- */
    const labelCountOk =
      state.labelCount === EXPECTED.total &&
      state.sidebarLabels === EXPECTED.sidebar &&
      state.tableLabels === EXPECTED.table;
    ledger.record('labels.counts', labelCountOk, {
      total: state.labelCount, sidebar: state.sidebarLabels, table: state.tableLabels, expected: EXPECTED,
    });

    const perAnchorOk = state.anchors.length === EXPECTED.total && state.anchors.every(function (anchor) {
      return anchor.state === 'resolved' && anchor.nextSiblingIsLabel && anchor.directLabelCount === 1;
    });
    ledger.record('labels.exactlyOnePerAcceptedAnchor', perAnchorOk, state.anchors.map(function (anchor) {
      return { index: anchor.index, href: anchor.href, state: anchor.state, nextSiblingIsLabel: anchor.nextSiblingIsLabel, directLabelCount: anchor.directLabelCount };
    }));

    const identityFailures = [];
    for (const label of state.labels) {
      const expected = expectedRegionForHref(label.anchorHref);
      const ok =
        expected !== null &&
        label.regionId === String(expected.id) &&
        label.linkHref === '/region/' + expected.id &&
        label.linkText === expected.name &&
        label.labelText === ' \u2014 ' + expected.name &&
        label.hasInlineStyle === false &&
        label.className === 'trn-region-label';
      if (!ok) identityFailures.push({ label: label, expected: expected });
    }
    ledger.record('labels.identity', identityFailures.length === 0, {
      labels: state.labels.map(function (label) {
        return { regionId: label.regionId, linkHref: label.linkHref, linkText: label.linkText, anchorHref: label.anchorHref, scope: label.scope };
      }),
      failures: identityFailures,
    });

    /* --- native anchor preservation (byte-identical minus data-trn-state) --- */
    const preservationFailures = [];
    for (let index = 0; index < pristine.anchors.length; index += 1) {
      const before = pristine.anchors[index];
      const after = state.anchors[index];
      const ok = !!after &&
        before.href === after.href &&
        before.text === after.text &&
        before.html === after.htmlWithoutState &&
        JSON.stringify(before.attrs) === JSON.stringify(after.attrsWithoutState);
      if (!ok) preservationFailures.push({ index: index, before: before, after: after || null });
    }
    ledger.record('native.anchorPreservation', preservationFailures.length === 0, {
      anchorsChecked: pristine.anchors.length,
      states: state.anchors.map(function (anchor) { return anchor.state; }),
      failures: preservationFailures,
    });

    /* --- layout: containment + no horizontal scroll + long-name wrapping --- */
    const outside = state.labels.filter(function (label) { return !label.insideContainer; });
    ledger.record('layout.labelInsideContainer', outside.length === 0, {
      outside: outside,
      rects: state.labels.map(function (label) {
        return { linkText: label.linkText, scope: label.scope, rect: label.rect, containerRect: label.containerRect };
      }),
    });

    const noHorizontalScroll =
      state.scrollWidth <= state.innerWidth + 1 &&
      state.bodyScrollWidth <= state.innerWidth + 1;
    ledger.record('layout.noHorizontalScroll', noHorizontalScroll, {
      scrollWidth: state.scrollWidth,
      bodyScrollWidth: state.bodyScrollWidth,
      innerWidth: state.innerWidth,
    });

    const noOverlap = state.overlapPairs.length === 0 && state.tailOverlapIndexes.length === 0;
    ledger.record('layout.noOverlap', noOverlap, {
      labelOverlapPairs: state.overlapPairs,
      labelTailTextOverlapIndexes: state.tailOverlapIndexes,
      method: 'line-box client rects (label vs label, label vs trailing text node)',
    });

    const longNameLabels = state.labels.filter(function (label) { return label.linkText === LONG_REGION_NAME; });
    const longNameOk =
      longNameLabels.length === 1 &&
      longNameLabels[0].insideContainer === true &&
      longNameLabels[0].lineBoxes >= 2;
    ledger.record('layout.longRegionNameWraps', longNameOk, {
      longName: LONG_REGION_NAME,
      matches: longNameLabels.length,
      lineBoxes: longNameLabels.length ? longNameLabels[0].lineBoxes : 0,
      insideContainer: longNameLabels.length ? longNameLabels[0].insideContainer : null,
      textPreserved: longNameLabels.length ? longNameLabels[0].linkText : null,
    });

    /* canonical enriched screenshot (labels freshly rendered) */
    const enrichedScreenshot = 'task-8-travian-region-news-userscript-' + width + '.png';
    await page.screenshot({ path: evidencePath(enrichedScreenshot), fullPage: true });

    /* --- dynamic replacement / pagination (both roots, pristine clones) --- */
    const tileCallsBeforeReplace = await page.evaluate(readTileCalls);
    await page.evaluate(replaceBothRoots);
    await page.waitForFunction(function (expected) {
      return document.querySelectorAll('.trn-region-label').length === expected;
    }, EXPECTED.total, { timeout: 25000, polling: 100 });
    const afterReplace = await page.evaluate(inspectPageState);
    const tileCallsAfterReplace = await page.evaluate(readTileCalls);

    const replaceOk =
      afterReplace.labelCount === EXPECTED.total &&
      afterReplace.sidebarLabels === EXPECTED.sidebar &&
      afterReplace.tableLabels === EXPECTED.table &&
      afterReplace.anchors.every(function (anchor) {
        return anchor.state === 'resolved' && anchor.nextSiblingIsLabel && anchor.directLabelCount === 1;
      }) &&
      tileCallsAfterReplace.calls.length === tileCallsBeforeReplace.calls.length;
    ledger.record('replace.labelsRestoredOnceFromCache', replaceOk, {
      labelsAfter: { total: afterReplace.labelCount, sidebar: afterReplace.sidebarLabels, table: afterReplace.tableLabels },
      tileCallsBefore: tileCallsBeforeReplace.calls,
      tileCallsAfter: tileCallsAfterReplace.calls,
      perAnchor: afterReplace.anchors.map(function (anchor) {
        return { index: anchor.index, state: anchor.state, directLabelCount: anchor.directLabelCount };
      }),
    });

    /* --- duplicate prevention: extra scan + enriched-clone replacement --- */
    const callsBeforeDedupe = await page.evaluate(readTileCalls);
    await page.evaluate(replaceSidebarWithEnrichedClone);
    const insertedByExtraScan = await page.evaluate(runExtraEnrichmentScan);
    await page.waitForTimeout(400);
    const afterDedupe = await page.evaluate(inspectPageState);
    const callsAfterDedupe = await page.evaluate(readTileCalls);
    const dedupeOk =
      insertedByExtraScan === 0 &&
      afterDedupe.labelCount === EXPECTED.total &&
      callsAfterDedupe.calls.length === callsBeforeDedupe.calls.length &&
      afterDedupe.anchors.every(function (anchor) { return anchor.directLabelCount === 1; });
    ledger.record('dedupe.noDuplicateLabelsOrRequests', dedupeOk, {
      insertedByExtraScan: insertedByExtraScan,
      labelCount: afterDedupe.labelCount,
      tileCallsBefore: callsBeforeDedupe.calls.length,
      tileCallsAfter: callsAfterDedupe.calls.length,
    });

    /* --- keyboard focus --- */
    const focusResults = await page.evaluate(focusEveryRegionLink);
    ledger.record('focus.programmaticFocus', focusResults.length === EXPECTED.total && focusResults.every(function (result) { return result.active; }), focusResults);

    await page.evaluate(blurActiveElement);
    /* container-scoped identity so all 7 links (not only 4 unique hrefs) count */
    const targetLinks = focusResults.map(function (result) { return result.scope + ':' + result.href; });
    const tabSequence = [];
    const reached = [];
    for (let press = 0; press < 160 && reached.length < targetLinks.length; press += 1) {
      await page.keyboard.press('Tab');
      const active = await page.evaluate(readActiveElement);
      tabSequence.push(active);
      if (active.regionLink && active.href) {
        const key = active.scope + ':' + active.href;
        if (reached.indexOf(key) === -1) reached.push(key);
      }
    }
    const tabWalkOk = targetLinks.every(function (key) { return reached.indexOf(key) !== -1; });
    ledger.record('focus.tabWalkReachesEveryRegionLink', tabWalkOk, {
      pressed: tabSequence.length,
      reached: reached,
      expected: targetLinks,
      sequence: tabSequence,
    });

    /* --- errors + network --- */
    ledger.record('errors.console', collectors.consoleErrors.length === 0, collectors.consoleErrors);
    ledger.record('errors.pageErrors', collectors.pageErrors.length === 0, collectors.pageErrors);

    const nonLocal = collectors.requests.filter(function (request) { return request.url.indexOf(LOCAL_ORIGIN) !== 0; });
    const travian = collectors.requests.filter(function (request) { return request.url.indexOf('travian.com') !== -1; });
    const tileCallsFinal = await page.evaluate(readTileCalls);
    const allCallsKnown = tileCallsFinal.calls.every(function (key) { return ALL_KEYS.indexOf(key) !== -1; });
    const networkOk =
      nonLocal.length === 0 &&
      travian.length === 0 &&
      collectors.requestFailures.length === 0 &&
      tileCallsFinal.calls.length >= ALL_KEYS.length &&
      tileCallsFinal.unexpected.length === 0 &&
      allCallsKnown;
    ledger.record('network.localOnlyAndStubbed', networkOk, {
      localOrigin: LOCAL_ORIGIN,
      nonLocalRequests: nonLocal,
      travianRequests: travian,
      requestFailures: collectors.requestFailures,
      tileCalls: tileCallsFinal.calls,
      unexpectedTileKeys: tileCallsFinal.unexpected,
    });

    const stats = await page.evaluate(readProductionStats);
    ledger.record('client.stats', !!stats && stats.inFlight === 0 && stats.startedCount === ALL_KEYS.length, stats);

    const report = {
      task: 'todo-8-browser-visual-qa',
      kind: 'happy',
      generatedAt: new Date().toISOString(),
      width: width,
      url: BASE_URL,
      browser: browserDescription,
      userscript: { path: USERSCRIPT_PATH, sha256: await sha256File(USERSCRIPT_PATH) },
      expected: EXPECTED,
      observed: {
        labelCount: state.labelCount,
        sidebarLabels: state.sidebarLabels,
        tableLabels: state.tableLabels,
        labels: state.labels,
        anchors: state.anchors,
        scrollWidth: state.scrollWidth,
        bodyScrollWidth: state.bodyScrollWidth,
        innerWidth: state.innerWidth,
        stats: stats,
      },
      checks: ledger.checks,
      consoleErrors: collectors.consoleErrors,
      consoleWarnings: collectors.consoleWarnings,
      pageErrors: collectors.pageErrors,
      networkRequests: collectors.requests,
      requestFailures: collectors.requestFailures,
      tileCalls: tileCallsFinal.calls,
      unexpectedTileKeys: tileCallsFinal.unexpected,
      screenshots: { native: nativeScreenshot, enriched: enrichedScreenshot },
      passed: ledger.failures().length === 0,
    };
    await writeFile(evidencePath('task-8-travian-region-news-userscript-' + width + '.json'), JSON.stringify(report, null, 2));
    return report;
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------------ */
/* failure runs                                                             */
/* ------------------------------------------------------------------------ */

async function runFailure(browser, browserDescription, scenario) {
  const ledger = createLedger();
  const context = await browser.newContext({
    viewport: { width: WIDTHS[2], height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
  });
  await context.route('**/favicon.ico', function (route) {
    return route.fulfill({ status: 204, body: '' });
  });
  const page = await context.newPage();
  const collectors = attachCollectors(page);

  try {
    await page.addInitScript(pageInitStub, {
      responses: buildFailureResponses(scenario),
      harnessSeed: {},
    });
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.evaluate(function () { return document.fonts.ready.then(function () { return true; }); });
    const pristine = await page.evaluate(seedExtraRow, { extraRowHtml: EXTRA_ROW_HTML });

    await page.addScriptTag({ path: USERSCRIPT_PATH });
    await page.waitForFunction(function () {
      const anchors = Array.from(document.querySelectorAll('a[href]')).filter(function (anchor) {
        return (anchor.getAttribute('href') || '').indexOf('/karte.php') !== -1;
      });
      return anchors.length === 7 && anchors.every(function (anchor) {
        return anchor.getAttribute('data-trn-state') === 'failed';
      });
    }, null, { timeout: 25000, polling: 100 });
    await page.waitForTimeout(600);

    const state = await page.evaluate(inspectPageState);
    const tileCalls = await page.evaluate(readTileCalls);
    const screenshot = 'task-8-travian-region-news-userscript-failure-' + scenario + '.png';
    await page.screenshot({ path: evidencePath(screenshot), fullPage: true });

    ledger.record('labels.zero', state.labelCount === 0, {
      total: state.labelCount, sidebar: state.sidebarLabels, table: state.tableLabels,
    });
    ledger.record('anchors.failedState', state.anchors.length === EXPECTED.total && state.anchors.every(function (anchor) {
      return anchor.state === 'failed';
    }), state.anchors.map(function (anchor) { return { index: anchor.index, href: anchor.href, state: anchor.state }; }));

    const preservationFailures = [];
    for (let index = 0; index < pristine.anchors.length; index += 1) {
      const before = pristine.anchors[index];
      const after = state.anchors[index];
      const ok = !!after &&
        before.href === after.href &&
        before.text === after.text &&
        before.html === after.htmlWithoutState &&
        JSON.stringify(before.attrs) === JSON.stringify(after.attrsWithoutState);
      if (!ok) preservationFailures.push({ index: index, before: before, after: after || null });
    }
    const containersNative =
      state.sidebarHtmlStripped === pristine.sidebarBoxHtml &&
      state.tbodyHtmlStripped === pristine.tbodyHtml;
    ledger.record('native.pageStaysNative', preservationFailures.length === 0 && containersNative, {
      preservationFailures: preservationFailures,
      containersNative: containersNative,
    });

    ledger.record('errors.console', collectors.consoleErrors.length === 0, collectors.consoleErrors);
    ledger.record('errors.pageErrors', collectors.pageErrors.length === 0, collectors.pageErrors);

    const nonLocal = collectors.requests.filter(function (request) { return request.url.indexOf(LOCAL_ORIGIN) !== 0; });
    const travian = collectors.requests.filter(function (request) { return request.url.indexOf('travian.com') !== -1; });
    const allCallsKnown = tileCalls.calls.every(function (key) { return ALL_KEYS.indexOf(key) !== -1; });
    const networkOk =
      nonLocal.length === 0 &&
      travian.length === 0 &&
      collectors.requestFailures.length === 0 &&
      tileCalls.unexpected.length === 0 &&
      tileCalls.calls.length > 0 &&
      allCallsKnown;
    ledger.record('network.localOnlyAndStubbed', networkOk, {
      nonLocalRequests: nonLocal,
      travianRequests: travian,
      requestFailures: collectors.requestFailures,
      tileCalls: tileCalls.calls,
      unexpectedTileKeys: tileCalls.unexpected,
    });

    return {
      task: 'todo-8-browser-visual-qa-failure',
      kind: 'failure',
      generatedAt: new Date().toISOString(),
      scenario: scenario,
      url: BASE_URL,
      width: WIDTHS[2],
      browser: browserDescription,
      userscript: { path: USERSCRIPT_PATH, sha256: await sha256File(USERSCRIPT_PATH) },
      labelCount: state.labelCount,
      labelsByContainer: { sidebar: state.sidebarLabels, table: state.tableLabels },
      anchorStates: state.anchors.map(function (anchor) { return { href: anchor.href, state: anchor.state }; }),
      consoleErrors: collectors.consoleErrors,
      pageErrors: collectors.pageErrors,
      networkRequests: collectors.requests,
      requestFailures: collectors.requestFailures,
      tileCalls: tileCalls.calls,
      unexpectedTileKeys: tileCalls.unexpected,
      screenshot: screenshot,
      checks: ledger.checks,
      passed: ledger.failures().length === 0,
    };
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------------ */
/* misc                                                                     */
/* ------------------------------------------------------------------------ */

async function sha256File(filePath) {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function describeBrowser(browser, launchMode) {
  return {
    engine: browser.browserType().name(),
    version: browser.version(),
    launchMode: launchMode,
  };
}

function printReportSummary(report) {
  const failures = report.checks.filter(function (check) { return !check.pass; });
  const labelSummary = report.kind === 'happy'
    ? 'labels ' + report.observed.labelCount + ' (sidebar ' + report.observed.sidebarLabels + ', table ' + report.observed.tableLabels + ')'
    : 'labels ' + report.labelCount;
  const prefix = report.kind === 'happy' ? '[' + report.width + 'px]' : '[' + report.scenario + ']';
  console.log(
    prefix + ' ' + (report.passed ? 'PASS' : 'FAIL') +
    ' ' + (report.checks.length - failures.length) + '/' + report.checks.length + ' checks | ' +
    labelSummary +
    ' | console errors ' + report.consoleErrors.length +
    ' | page errors ' + report.pageErrors.length +
    ' | tile calls ' + report.tileCalls.length +
    ' | requests ' + report.networkRequests.length
  );
  for (const failure of failures) {
    console.log('    FAILED: ' + failure.id + ' -> ' + JSON.stringify(failure.details));
  }
}

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const playwright = await loadPlaywright();
  const { browser, launchMode } = await launchChrome(playwright);
  const browserDescription = describeBrowser(browser, launchMode);
  console.log('Browser launched:', JSON.stringify(browserDescription));
  console.log('Serving base URL:', BASE_URL);

  const reports = [];
  const failures = [];

  try {
    for (const width of WIDTHS) {
      const report = await runHappy(browser, browserDescription, width);
      reports.push(report);
      printReportSummary(report);
      if (!report.passed) failures.push('happy@' + width);
    }

    const failureRuns = [];
    for (const scenario of FAILURE_SCENARIOS) {
      const run = await runFailure(browser, browserDescription, scenario);
      failureRuns.push(run);
      printReportSummary(run);
      if (!run.passed) failures.push('failure:' + scenario);
    }
    await writeFile(
      evidencePath('task-8-travian-region-news-userscript-failure.json'),
      JSON.stringify({
        task: 'todo-8-browser-visual-qa-failure',
        generatedAt: new Date().toISOString(),
        url: BASE_URL,
        browser: browserDescription,
        userscriptSha256: await sha256File(USERSCRIPT_PATH),
        scenarios: failureRuns,
        passed: failureRuns.every(function (run) { return run.passed; }),
      }, null, 2)
    );
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error('QA FAILED: ' + failures.join(', '));
    process.exitCode = 1;
  } else {
    console.log('QA PASSED: ' + reports.length + ' width runs + ' + FAILURE_SCENARIOS.length + ' failure runs.');
  }
}

main().catch(function (error) {
  console.error('DRIVER FAILURE:', error && error.stack ? error.stack : error);
  process.exitCode = 2;
});
