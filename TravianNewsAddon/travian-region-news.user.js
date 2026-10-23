// ==UserScript==
// @name         Travian Region News (cw.x2)
// @namespace    travian-region-news
// @version      0.1.0
// @description  Pokazuje nazwę regionu przy wydarzeniach sojuszu w Travian (świat cw.x2). Bez usług zewnętrznych.
// @match        https://cw.x2.international.travian.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  // =========================================================================
  // Travian Region News — core data layer (Todo 3).
  //
  // Sections:
  //   1. constants
  //   2. pure helpers (coordinates, cache keys, response parsing)
  //   3. tile-details client (cache + dedupe + bounded queue + cooldown)
  //   4. production adapters and inert bootstrap (Todos 4-6 extend here)
  //
  // Privacy: only {v, regionId, regionName, fetchedAt} is persisted; response
  // bodies and session data are never logged or stored.
  // =========================================================================

  // -------------------------------------------------------------------------
  // 1. Constants (session scoped; relative endpoint path only)
  // -------------------------------------------------------------------------
  const constants = Object.freeze({
    TTL_MS: 86400000,
    MAX_CONCURRENT: 2,
    MIN_START_GAP_MS: 300,
    PAGE_CAP: 50,
    TIMEOUT_MS: 10000,
    COOLDOWN_MS: 900000,
    CACHE_SCHEMA_VERSION: 1,
  });

  const TILE_DETAILS_PATH = '/api/v1/map/tile-details';
  const REGION_HREF_PATTERN = /^\/region\/([1-9][0-9]*)$/;
  const CANONICAL_INT_PATTERN = /^-?(?:0|[1-9][0-9]*)$/;

  // -------------------------------------------------------------------------
  // 2. Pure helpers
  // -------------------------------------------------------------------------

  /** Canonical integer (number or string) -> integer; -0 -> 0; otherwise null. */
  function normalizeCoordinate(value) {
    let numeric = null;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
      numeric = value;
    } else if (typeof value === 'string') {
      if (!CANONICAL_INT_PATTERN.test(value)) return null;
      numeric = Number(value);
    } else {
      return null;
    }
    if (!Number.isSafeInteger(numeric)) return null;
    return numeric === 0 ? 0 : numeric;
  }

  /** Strip trailing slashes so origin + relative path concatenation stays exact. */
  function normalizeOrigin(origin) {
    let text = origin === null || origin === undefined ? '' : String(origin);
    while (text.length > 1 && text.charAt(text.length - 1) === '/') {
      text = text.slice(0, -1);
    }
    return text;
  }

  /** "<origin>:<x>|<y>" with normalized integers (null when coordinates are invalid). */
  function makeCacheKey(origin, x, y) {
    const nx = normalizeCoordinate(x);
    const ny = normalizeCoordinate(y);
    if (nx === null || ny === null) return null;
    const base = origin === null || origin === undefined ? '' : String(origin);
    return base + ':' + nx + '|' + ny;
  }

  /** payload {html} / JSON text / raw html string -> html string; otherwise null. */
  function extractHtmlPayload(payload) {
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (trimmed.charAt(0) === '{') {
        try {
          const decoded = JSON.parse(trimmed);
          if (decoded !== null && typeof decoded === 'object' && typeof decoded.html === 'string') {
            return decoded.html;
          }
          return null;
        } catch (error) {
          return payload;
        }
      }
      return payload;
    }
    if (payload !== null && typeof payload === 'object' && typeof payload.html === 'string') {
      return payload.html;
    }
    return null;
  }

  /**
   * Parse a tile-details payload into a frozen {regionId, regionName} or null.
   * Contract: first #village_info a[href^="/region/"], href must match
   * /region/<positive integer>, anchor text must be non-empty. Never throws.
   */
  function parseTileDetailsResponse(payload) {
    try {
      const html = extractHtmlPayload(payload);
      if (typeof html !== 'string' || html.length === 0) return null;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const anchor = doc.querySelector('#village_info a[href^="/region/"]');
      if (!anchor) return null;
      const match = REGION_HREF_PATTERN.exec(anchor.getAttribute('href') || '');
      if (!match) return null;
      const regionName = (anchor.textContent || '').trim();
      if (regionName.length === 0) return null;
      return Object.freeze({ regionId: Number(match[1]), regionName: regionName });
    } catch (error) {
      return null;
    }
  }

  /** Best-effort AbortController creation (absent in exotic embeddings). */
  function createAbortController() {
    let Ctor = null;
    if (typeof AbortController === 'function') Ctor = AbortController;
    else if (typeof window !== 'undefined' && typeof window.AbortController === 'function') {
      Ctor = window.AbortController;
    }
    if (!Ctor) return null;
    try {
      return new Ctor();
    } catch (error) {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // 3. Event discovery (Todo 4) — locale-scoped and side-effect free
  // -------------------------------------------------------------------------

  const EVENT_WORDINGS = Object.freeze({
    founding: 'założył(a) nową osadę',
    conquest: 'podbił(a) osadę',
    loss: 'utracił(a) osadę',
  });

  const EVENT_CONTAINER_SELECTOR = 'li, tr';
  const VILLAGE_LIST_SELECTOR = '#sidebarBoxVillageList';
  const COORDINATE_LINK_MARKER = '/karte.php';

  /** Collapse bidi/whitespace noise before matching approved event wordings. */
  function normalizeEventText(value) {
    return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
  }

  /** True when the normalized container text contains an approved wording. */
  function matchesApprovedEventText(text) {
    return text.indexOf(EVENT_WORDINGS.founding) !== -1
      || text.indexOf(EVENT_WORDINGS.conquest) !== -1
      || text.indexOf(EVENT_WORDINGS.loss) !== -1;
  }

  /** Origin used to resolve relative coordinate hrefs (injectable for tests). */
  function resolveDiscoveryOrigin(injectedOrigin) {
    if (typeof injectedOrigin === 'string' && injectedOrigin.length > 0) return injectedOrigin;
    try {
      if (typeof window !== 'undefined' && window.location && typeof window.location.origin === 'string') {
        const origin = window.location.origin;
        if (origin.length > 0 && origin !== 'null') return origin;
      }
    } catch (error) {
      /* fall through to an empty base */
    }
    return '';
  }

  /**
   * /karte.php href -> {x, y} or null.
   * Requires exactly one x and one y query parameter and canonical integers.
   */
  function parseCoordinateLink(href, origin) {
    if (typeof href !== 'string' || href.length === 0) return null;
    let url;
    try {
      url = new URL(href, origin || undefined);
    } catch (error) {
      return null;
    }
    if (!url.pathname.endsWith(COORDINATE_LINK_MARKER)) return null;
    const xs = url.searchParams.getAll('x');
    const ys = url.searchParams.getAll('y');
    if (xs.length !== 1 || ys.length !== 1) return null;
    const x = normalizeCoordinate(xs[0]);
    const y = normalizeCoordinate(ys[0]);
    if (x === null || y === null) return null;
    return { x: x, y: y };
  }

  /**
   * Nearest li/tr event container for an anchor; null when absent or when the
   * anchor belongs to the village list (never an event surface).
   */
  function findEventContainer(anchor) {
    const container = anchor.closest(EVENT_CONTAINER_SELECTOR);
    if (!container) return null;
    if (container.closest(VILLAGE_LIST_SELECTOR)) return null;
    return container;
  }

  /**
   * Discover accepted event coordinate anchors under root.
   * Returns one {anchor, container, x, y} descriptor per accepted anchor in
   * document order. Duplicate coordinates stay separate descriptors; the
   * client deduplicates network lookups by coordinate.
   */
  function discoverEvents(root, injectedOrigin) {
    const descriptors = [];
    try {
      if (!root || typeof root.querySelectorAll !== 'function') return descriptors;
      const origin = resolveDiscoveryOrigin(injectedOrigin);
      const anchors = root.querySelectorAll('a[href]');
      for (let index = 0; index < anchors.length; index += 1) {
        const anchor = anchors[index];
        const href = anchor.getAttribute('href') || '';
        if (href.indexOf(COORDINATE_LINK_MARKER) === -1) continue;
        const coordinates = parseCoordinateLink(href, origin);
        if (!coordinates) continue;
        const container = findEventContainer(anchor);
        if (!container) continue;
        if (!matchesApprovedEventText(normalizeEventText(container.textContent))) continue;
        descriptors.push({
          anchor: anchor,
          container: container,
          x: coordinates.x,
          y: coordinates.y,
        });
      }
    } catch (error) {
      return descriptors;
    }
    return descriptors;
  }

  // -------------------------------------------------------------------------
  // 4. Tile-details client (cache, in-flight dedupe, bounded queue, cooldown)
  // -------------------------------------------------------------------------

  const defaultStorage = {
    get: function () { return undefined; },
    set: function () { /* no-op */ },
  };

  function createClient(deps) {
    const options = deps || {};
    const fetchImpl = typeof options.fetch === 'function'
      ? options.fetch
      : function () { return Promise.reject(new Error('fetch unavailable')); };
    const storage = options.storage
      && typeof options.storage.get === 'function'
      && typeof options.storage.set === 'function'
      ? options.storage
      : defaultStorage;
    const now = typeof options.now === 'function' ? options.now : function () { return Date.now(); };
    const setTimer = typeof options.setTimeout === 'function'
      ? options.setTimeout
      : function (fn, ms) { return setTimeout(fn, ms); };
    const clearTimer = typeof options.clearTimeout === 'function'
      ? options.clearTimeout
      : function (id) { clearTimeout(id); };

    const inFlight = new Map();
    const queue = [];
    const activeControllers = new Set();
    let activeCount = 0;
    let startedCount = 0;
    let cacheHits = 0;
    let cooldownUntil = 0;
    let stoppedPermanently = false;
    let lastStartAt = null;
    let pumpTimer = null;

    /** Halted when stop() was called or an auth/rate cooldown is active. */
    function isHalted() {
      return stoppedPermanently || now() < cooldownUntil;
    }

    function publicValue(entry) {
      return Object.freeze({ regionId: entry.regionId, regionName: entry.regionName });
    }

    function staleOrNull(entry) {
      return entry ? publicValue(entry) : null;
    }

    /** Validate a stored record; malformed entries are treated as cache misses. */
    function decodeCached(raw) {
      let record = raw;
      if (typeof record === 'string') {
        try {
          record = JSON.parse(record);
        } catch (error) {
          return null;
        }
      }
      if (record === null || typeof record !== 'object') return null;
      if (record.v !== constants.CACHE_SCHEMA_VERSION) return null;
      if (!Number.isSafeInteger(record.regionId) || record.regionId <= 0) return null;
      const regionName = typeof record.regionName === 'string' ? record.regionName.trim() : '';
      if (regionName.length === 0) return null;
      if (typeof record.fetchedAt !== 'number' || !Number.isFinite(record.fetchedAt)) return null;
      return Object.freeze({
        v: constants.CACHE_SCHEMA_VERSION,
        regionId: record.regionId,
        regionName: regionName,
        fetchedAt: record.fetchedAt,
      });
    }

    function readCache(key) {
      let raw;
      try {
        raw = storage.get(key);
      } catch (error) {
        return null;
      }
      const entry = decodeCached(raw);
      if (!entry) return null;
      const age = now() - entry.fetchedAt;
      return { entry: entry, fresh: age >= 0 && age < constants.TTL_MS };
    }

    function writeCache(key, value) {
      const record = {
        v: constants.CACHE_SCHEMA_VERSION,
        regionId: value.regionId,
        regionName: value.regionName,
        fetchedAt: now(),
      };
      try {
        storage.set(key, record);
      } catch (error) {
        /* storage quota/corruption stays an isolated failure */
      }
    }

    function completeTask(task, value) {
      if (task.settled) return;
      task.settled = true;
      if (inFlight.get(task.key) === task.promise) inFlight.delete(task.key);
      task.settle(value);
    }

    function failQueued() {
      while (queue.length > 0) {
        const task = queue.shift();
        completeTask(task, staleOrNull(task.stale));
      }
    }

    /** 401/403/429: freeze new lookups for the cooldown window, never retry. */
    function settleFromAuth() {
      cooldownUntil = now() + constants.COOLDOWN_MS;
      if (pumpTimer !== null) {
        clearTimer(pumpTimer);
        pumpTimer = null;
      }
      failQueued();
    }

    function abortActive() {
      activeControllers.forEach(function (controller) {
        try {
          controller.abort();
        } catch (error) {
          /* already settled */
        }
      });
    }

    function handleResponse(task, response) {
      return Promise.resolve().then(function () {
        const status = response && typeof response.status === 'number' ? response.status : 0;
        if (status === 401 || status === 403 || status === 429) {
          settleFromAuth();
          return null;
        }
        if (status >= 400) return null;
        let bodyPromise;
        if (response && typeof response.json === 'function') {
          bodyPromise = response.json();
        } else if (response && typeof response.text === 'function') {
          bodyPromise = response.text().then(function (text) { return JSON.parse(text); });
        } else {
          return null;
        }
        return Promise.resolve(bodyPromise).then(function (payload) {
          const parsed = parseTileDetailsResponse(payload);
          if (!parsed) return null;
          writeCache(task.key, parsed);
          return parsed;
        });
      });
    }

    function startTask(task) {
      activeCount += 1;
      lastStartAt = now();
      const controller = createAbortController();
      let timeoutId = null;
      let settled = false;

      if (controller) {
        activeControllers.add(controller);
        timeoutId = setTimer(function () {
          try {
            controller.abort();
          } catch (error) {
            /* already aborted */
          }
        }, constants.TIMEOUT_MS);
      }

      function finish(value) {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) {
          clearTimer(timeoutId);
          timeoutId = null;
        }
        if (controller) activeControllers.delete(controller);
        activeCount -= 1;
        completeTask(task, value === null || value === undefined ? staleOrNull(task.stale) : value);
        pump();
      }

      const requestOptions = {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=UTF-8',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ x: task.x, y: task.y }),
      };
      if (controller) requestOptions.signal = controller.signal;

      Promise.resolve()
        .then(function () { return fetchImpl(task.origin + TILE_DETAILS_PATH, requestOptions); })
        .then(function (response) { return handleResponse(task, response); })
        .catch(function () { return null; })
        .then(function (value) { finish(value); });
    }

    /** Start queued tasks while respecting concurrency and start spacing. */
    function pump() {
      if (isHalted()) {
        failQueued();
        return;
      }
      if (pumpTimer !== null) return;
      while (activeCount < constants.MAX_CONCURRENT && queue.length > 0) {
        let wait = 0;
        if (lastStartAt !== null) wait = constants.MIN_START_GAP_MS - (now() - lastStartAt);
        if (wait > 0) {
          pumpTimer = setTimer(function () {
            pumpTimer = null;
            pump();
          }, wait);
          return;
        }
        startTask(queue.shift());
      }
    }

    function createLookup(x, y, origin, staleEntry) {
      const key = makeCacheKey(origin, x, y);
      const task = {
        key: key,
        x: x,
        y: y,
        origin: origin,
        stale: staleEntry || null,
        settled: false,
        promise: null,
        settle: null,
      };
      task.promise = new Promise(function (resolveTask) {
        task.settle = resolveTask;
      });
      inFlight.set(key, task.promise);
      queue.push(task);
      pump();
      return task.promise;
    }

    function resolve(x, y, origin) {
      try {
        const nx = normalizeCoordinate(x);
        const ny = normalizeCoordinate(y);
        if (nx === null || ny === null) return Promise.resolve(null);
        const normalizedOrigin = normalizeOrigin(origin);
        const key = makeCacheKey(normalizedOrigin, nx, ny);

        const cached = readCache(key);
        if (cached && cached.fresh) {
          cacheHits += 1;
          return Promise.resolve(publicValue(cached.entry));
        }

        const pending = inFlight.get(key);
        if (pending) return pending;

        if (isHalted()) return Promise.resolve(staleOrNull(cached ? cached.entry : null));
        if (startedCount >= constants.PAGE_CAP) return Promise.resolve(staleOrNull(cached ? cached.entry : null));

        startedCount += 1;
        return createLookup(nx, ny, normalizedOrigin, cached ? cached.entry : null);
      } catch (error) {
        return Promise.resolve(null);
      }
    }

    function getStats() {
      return {
        inFlight: inFlight.size,
        startedCount: startedCount,
        cacheHits: cacheHits,
        cooldownUntil: cooldownUntil,
        stopped: isHalted(),
      };
    }

    function stop() {
      stoppedPermanently = true;
      if (pumpTimer !== null) {
        clearTimer(pumpTimer);
        pumpTimer = null;
      }
      failQueued();
      abortActive();
    }

    return Object.freeze({
      resolve: resolve,
      getStats: getStats,
      stop: stop,
    });
  }

  // -------------------------------------------------------------------------
  // 5. RegionEventLabel rendering + safe observer (Todo 5)
  // -------------------------------------------------------------------------

  const LABEL_CLASS = 'trn-region-label';
  const ANCHOR_STATE_ATTR = 'data-trn-state';
  const REGION_ID_ATTR = 'data-trn-region-id';
  const LABEL_LINK_PREFIX = '/region/';
  const SEPARATOR_GLYPH = '\u2014';

  /** True when the coordinate anchor already carries its adjacent label. */
  function hasRegionLabel(anchor) {
    const sibling = anchor.nextElementSibling;
    return Boolean(sibling && sibling.classList && sibling.classList.contains(LABEL_CLASS));
  }

  /** Anchors claimed by an in-flight or finished lookup are never restarted. */
  function isAnchorClaimed(anchor) {
    if (hasRegionLabel(anchor)) return true;
    const state = anchor.getAttribute(ANCHOR_STATE_ATTR);
    return state === 'pending' || state === 'resolved';
  }

  /** Build the label fragment with DOM APIs only (region name is untrusted). */
  function createRegionLabelElement(documentRef, region) {
    const label = documentRef.createElement('span');
    label.className = LABEL_CLASS;
    label.setAttribute(REGION_ID_ATTR, String(region.regionId));
    label.appendChild(documentRef.createTextNode(' ' + SEPARATOR_GLYPH + ' '));
    const link = documentRef.createElement('a');
    link.setAttribute('href', LABEL_LINK_PREFIX + region.regionId);
    link.textContent = region.regionName;
    label.appendChild(link);
    return label;
  }

  /** True only while the anchor is still attached to a rendered document. */
  function isAnchorAttached(anchor) {
    if (typeof anchor.isConnected === 'boolean') return anchor.isConnected;
    return Boolean(anchor.parentNode);
  }

  function insertRegionLabel(anchor, region) {
    if (!isAnchorAttached(anchor)) return false;
    try {
      const label = createRegionLabelElement(anchor.ownerDocument, region);
      anchor.parentNode.insertBefore(label, anchor.nextSibling);
      anchor.setAttribute(ANCHOR_STATE_ATTR, 'resolved');
      return true;
    } catch (error) {
      return false;
    }
  }

  function processDescriptor(descriptor, client, origin) {
    const anchor = descriptor.anchor;
    try {
      anchor.setAttribute(ANCHOR_STATE_ATTR, 'pending');
    } catch (error) {
      /* an unwritable anchor cannot be processed */
    }
    return Promise.resolve()
      .then(function () { return client.resolve(descriptor.x, descriptor.y, origin); })
      .catch(function () { return null; })
      .then(function (region) {
        if (region) {
          if (hasRegionLabel(anchor)) return false;
          return insertRegionLabel(anchor, region);
        }
        if (!hasRegionLabel(anchor)) {
          try {
            anchor.setAttribute(ANCHOR_STATE_ATTR, 'failed');
          } catch (error) {
            return false;
          }
        }
        return false;
      })
      .catch(function () { return false; });
  }

  /** Insert one label per newly discovered descriptor; idempotent per anchor. */
  function enrichEvents(root, client, origin) {
    const descriptors = discoverEvents(root, origin);
    const tasks = [];
    for (let index = 0; index < descriptors.length; index += 1) {
      const descriptor = descriptors[index];
      if (isAnchorClaimed(descriptor.anchor)) continue;
      tasks.push(processDescriptor(descriptor, client, origin));
    }
    return Promise.all(tasks).then(function (results) {
      let inserted = 0;
      for (let index = 0; index < results.length; index += 1) {
        if (results[index] === true) inserted += 1;
      }
      return inserted;
    });
  }

  /** True for nodes the observer must never react to (its own label output). */
  function isOwnLabelNode(node) {
    if (!node || node.nodeType !== 1 || typeof node.closest !== 'function') return false;
    return Boolean(node.closest('.' + LABEL_CLASS));
  }

  function collectAddedRoots(mutations) {
    const roots = [];
    for (let m = 0; m < mutations.length; m += 1) {
      const added = mutations[m].addedNodes;
      for (let n = 0; n < added.length; n += 1) {
        const node = added[n];
        if (node.nodeType !== 1 && node.nodeType !== 11) continue;
        if (isOwnLabelNode(node)) continue;
        roots.push(node);
      }
    }
    return roots;
  }

  /** Drop roots that are already contained in another added root. */
  function uniqueAddedRoots(roots) {
    const unique = [];
    for (let i = 0; i < roots.length; i += 1) {
      let contained = false;
      for (let j = 0; j < roots.length; j += 1) {
        if (i === j) continue;
        const other = roots[j];
        if (other.nodeType === 1 && typeof other.contains === 'function' && other.contains(roots[i])) {
          contained = true;
          break;
        }
      }
      if (!contained) unique.push(roots[i]);
    }
    return unique;
  }

  /**
   * One MutationObserver over target ({childList, subtree}). Added roots are
   * batched into a single microtask and enriched once; own labels are ignored.
   */
  function createObserver(config) {
    const options = config || {};
    const client = options.client;
    const origin = options.origin;
    const target = options.target || (typeof document !== 'undefined' ? document.body : null);
    const MutationObserverImpl = typeof MutationObserver === 'function'
      ? MutationObserver
      : (typeof window !== 'undefined' && window.MutationObserver ? window.MutationObserver : null);

    let disconnected = false;
    let batchScheduled = false;
    let queuedRoots = [];
    let workChain = Promise.resolve();
    let observer = null;

    function enqueueRoots(roots) {
      if (disconnected || roots.length === 0) return;
      for (let index = 0; index < roots.length; index += 1) queuedRoots.push(roots[index]);
      if (batchScheduled) return;
      batchScheduled = true;
      Promise.resolve().then(drainBatch);
    }

    function drainBatch() {
      batchScheduled = false;
      if (disconnected) {
        queuedRoots = [];
        return;
      }
      const roots = uniqueAddedRoots(queuedRoots);
      queuedRoots = [];
      if (roots.length === 0) return;
      workChain = workChain
        .then(function () {
          let chain = Promise.resolve();
          for (let index = 0; index < roots.length; index += 1) {
            const root = roots[index];
            chain = chain.then(function () { return enrichEvents(root, client, origin); });
          }
          return chain;
        })
        .catch(function () { return undefined; });
    }

    function flush() {
      function settle() {
        return Promise.resolve().then(function () {
          if (batchScheduled) return settle();
          return workChain.then(
            function () {
              if (batchScheduled) return settle();
              return undefined;
            },
            function () { return undefined; },
          );
        });
      }
      return settle();
    }

    function disconnect() {
      disconnected = true;
      queuedRoots = [];
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }

    if (target && MutationObserverImpl) {
      observer = new MutationObserverImpl(function (mutations) {
        if (disconnected) return;
        enqueueRoots(collectAddedRoots(mutations));
      });
      observer.observe(target, { childList: true, subtree: true });
    }

    return Object.freeze({ disconnect: disconnect, flush: flush });
  }

  // -------------------------------------------------------------------------
  // 6. Production adapters, startup and cleanup (Todo 6)
  // -------------------------------------------------------------------------

  function createProductionStorage() {
    return {
      get: function (key) {
        if (typeof GM_getValue !== 'function') return undefined;
        try {
          return GM_getValue(key, undefined);
        } catch (error) {
          return undefined;
        }
      },
      set: function (key, value) {
        if (typeof GM_setValue !== 'function') return;
        try {
          GM_setValue(key, value);
        } catch (error) {
          /* quota/corruption is an isolated failure */
        }
      },
    };
  }

  function createProductionDeps() {
    return {
      fetch: function (url, requestOptions) { return window.fetch(url, requestOptions); },
      storage: createProductionStorage(),
      now: function () { return Date.now(); },
      setTimeout: function (fn, ms) { return window.setTimeout(fn, ms); },
      clearTimeout: function (id) { window.clearTimeout(id); },
    };
  }

  const DEBUG = false;

  /** Single gated diagnostic channel; emits nothing while DEBUG is false. */
  function debugWarn(message) {
    if (DEBUG !== true) return;
    try {
      console.warn('[TRN]', message);
    } catch (error) {
      /* diagnostics must never break the page */
    }
  }

  const INERT_CONTROLLER = Object.freeze({
    stop: function () {},
    isActive: function () { return false; },
    flush: function () { return Promise.resolve(); },
  });

  const INERT_OBSERVER = Object.freeze({
    disconnect: function () {},
    flush: function () { return Promise.resolve(); },
  });

  const startedApps = new WeakMap();

  /**
   * One startup per document: initial enrichment + exactly one observer, with
   * pagehide/beforeunload teardown. Repeated calls return the same controller.
   */
  function startApp(config) {
    const options = config || {};
    const win = options.window || (typeof window !== 'undefined' ? window : null);
    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const client = options.client;
    const origin = options.origin;
    const target = options.target || (doc ? doc.body : null);

    if (!doc || !client || !target) return INERT_CONTROLLER;
    if (startedApps.has(doc)) return startedApps.get(doc);

    let active = true;
    let stopped = false;
    let warned = false;
    let observer;

    function warnOnce(message) {
      if (warned) return;
      warned = true;
      debugWarn(message);
    }

    try {
      observer = createObserver({ client: client, origin: origin, target: target });
    } catch (error) {
      observer = INERT_OBSERVER;
      warnOnce('observer setup failed');
    }

    function cleanup() {
      stop();
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      active = false;
      try {
        if (typeof client.stop === 'function') client.stop();
      } catch (error) {
        /* teardown must never throw */
      }
      try {
        observer.disconnect();
      } catch (error) {
        /* already disconnected */
      }
      if (win && typeof win.removeEventListener === 'function') {
        win.removeEventListener('pagehide', cleanup);
        win.removeEventListener('beforeunload', cleanup);
      }
    }

    function isActive() {
      return active;
    }

    const initialWork = Promise.resolve()
      .then(function () { return enrichEvents(target, client, origin); })
      .catch(function () {
        warnOnce('initial enrichment failed');
        return 0;
      });

    function flush() {
      return Promise.resolve(initialWork).then(function () {
        return observer.flush();
      });
    }

    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('pagehide', cleanup);
      win.addEventListener('beforeunload', cleanup);
    }

    const controller = Object.freeze({
      stop: stop,
      isActive: isActive,
      flush: flush,
    });
    startedApps.set(doc, controller);
    return controller;
  }

  let productionStarted = false;

  function start() {
    if (productionStarted) return;
    productionStarted = true;
    try {
      startApp({
        window: window,
        document: window.document,
        client: productionClient,
        origin: window.location.origin,
        target: window.document.body,
      });
    } catch (error) {
      debugWarn('startup failed');
    }
  }

  const isTestMode = window.__TRN_TEST_MODE__ === true;

  if (isTestMode) {
    window.__TRN_TEST_API__ = Object.freeze({
      constants: constants,
      EVENT_WORDINGS: EVENT_WORDINGS,
      LABEL_CLASS: LABEL_CLASS,
      ANCHOR_STATE_ATTR: ANCHOR_STATE_ATTR,
      DEBUG: DEBUG,
      discoverEvents: discoverEvents,
      parseTileDetailsResponse: parseTileDetailsResponse,
      normalizeCoordinate: normalizeCoordinate,
      makeCacheKey: makeCacheKey,
      createClient: createClient,
      enrichEvents: enrichEvents,
      createObserver: createObserver,
      startApp: startApp,
    });
    return;
  }

  const productionClient = createClient(createProductionDeps());

  window.__TRN_PRODUCTION__ = Object.freeze({
    constants: constants,
    EVENT_WORDINGS: EVENT_WORDINGS,
    LABEL_CLASS: LABEL_CLASS,
    ANCHOR_STATE_ATTR: ANCHOR_STATE_ATTR,
    DEBUG: DEBUG,
    client: productionClient,
    createClient: createClient,
    discoverEvents: discoverEvents,
    parseTileDetailsResponse: parseTileDetailsResponse,
    normalizeCoordinate: normalizeCoordinate,
    makeCacheKey: makeCacheKey,
    enrichEvents: enrichEvents,
    createObserver: createObserver,
    startApp: startApp,
    start: start,
  });

  // document-idle guarantees the DOM exists; the readyState branch plus the
  // started flag keep a DOMContentLoaded race and repeated calls at exactly one startup.
  if (window.document.readyState === 'loading') {
    window.document.addEventListener('DOMContentLoaded', function () { start(); }, { once: true });
  } else {
    start();
  }
})();
