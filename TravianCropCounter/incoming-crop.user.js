// ==UserScript==
// @name         Travian - zboże oddziałów
// @namespace    peterpage-travian-scripts
// @version      1.12
// @homepageURL  https://github.com/PeterPage2115/TravianScripts
// @supportURL   https://github.com/PeterPage2115/TravianScripts/issues
// @updateURL    https://raw.githubusercontent.com/PeterPage2115/TravianScripts/main/TravianCropCounter/incoming-crop.user.js
// @downloadURL  https://raw.githubusercontent.com/PeterPage2115/TravianScripts/main/TravianCropCounter/incoming-crop.user.js
// @description  Sumuje zboże, atak i deff oddziałów przychodzących i stacjonujących (Miejsce zbiórki), ze wszystkich stron listy.
// @match        https://*.travian.com/build.php*
// @match        https://*.travian.com/village/statistics/troops*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// [attack, def vs infantry, def vs cavalry, crop upkeep] for u1..u90 (base values, no smithy upgrades).
// Source: Travian Resource Bar+ 2.26.16 (RB.tropsI).
const STATS = [
  // Romans (u1-u10)
  [40,35,50,1], [30,65,35,1], [70,40,25,1], [0,20,10,2], [120,65,50,3], [180,80,105,4], [60,30,75,3], [75,60,10,6], [50,40,30,5], [0,80,80,1],
  // Teutons (u11-u20)
  [40,20,5,1], [10,35,60,1], [60,30,30,1], [0,10,5,1], [55,100,40,2], [150,50,75,3], [65,30,80,3], [50,60,10,6], [40,60,40,4], [10,80,80,1],
  // Gauls (u21-u30)
  [15,40,50,1], [65,35,20,1], [0,20,10,2], [100,25,40,2], [45,115,55,2], [140,60,165,3], [50,30,105,3], [70,45,10,6], [40,50,50,4], [0,80,80,1],
  // Nature (u31-u40)
  [10,25,20,1], [20,35,40,1], [60,40,60,1], [80,66,50,1], [50,70,33,2], [100,80,70,2], [250,140,200,3], [450,380,240,3], [200,170,250,3], [600,440,520,5],
  // Natars (u41-u50)
  [20,35,50,1], [65,30,10,1], [100,90,75,1], [0,10,10,1], [155,80,50,2], [170,140,80,3], [250,120,150,4], [60,45,10,5], [80,50,50,1], [30,40,40,1],
  // Egyptians (u51-u60)
  [10,30,20,1], [30,55,40,1], [65,50,20,1], [0,20,10,2], [50,110,50,2], [110,120,150,3], [55,30,95,3], [65,55,10,6], [40,50,50,4], [0,80,80,1],
  // Huns (u61-u70)
  [35,40,30,1], [50,30,10,1], [0,20,10,2], [120,30,15,2], [110,80,70,2], [180,60,40,3], [65,30,90,3], [45,55,10,6], [50,40,30,4], [10,80,80,1],
  // Spartans (u71-u80)
  [50,35,30,1], [0,40,22,1], [40,85,45,1], [90,55,40,1], [55,120,90,2], [195,80,75,3], [65,30,80,3], [50,60,10,6], [40,60,40,4], [10,80,80,1],
  // Vikings (u81-u90)
  [45,22,5,1], [20,50,30,1], [70,30,25,2], [0,10,5,1], [45,95,100,2], [160,50,75,2], [65,30,80,3], [50,60,10,6], [40,40,60,4], [10,80,80,1],
];
// Community Week servers re-balance some Roman/Teuton/Gaul units (same server list as RB+).
const CW_SERVERS = ['cw.x2', 'cw2.x2', 'cw2.x5', 'romani', 'france', 'hux.x3', 'alpler', 'eternos', 'nordics', 'czsk', 'united', 'lusobr', 'garuda'];
const CW_STATS = { 1: [50,40,55,1], 3: [75,40,25,1], 5: [130,65,50,3], 6: [195,80,105,4], 13: [65,30,30,1],
  15: [90,100,40,2], 22: [70,35,20,1], 24: [110,25,40,2], 26: [150,65,165,3] };
const isCW = (host) => CW_SERVERS.some((p) => host.startsWith(p));
if (typeof location !== 'undefined' && isCW(location.hostname)) Object.entries(CW_STATS).forEach(([u, s]) => { STATS[u - 1] = s; });
const HERO = [0, 0, 0, 6]; // hero strength depends on the hero; only upkeep is counted

// units: class names ("u21", "uhero"), counts: matching numbers -> [attack, defInf, defCav, crop].
function tally(units, counts) {
  const sum = [0, 0, 0, 0];
  units.forEach((u, i) => {
    const st = u === 'uhero' ? HERO : STATS[+u?.slice(1) - 1];
    if (counts[i] && !st) console.warn('Unknown unit', u, '- counted as 0');
    sum.forEach((_, k) => { sum[k] += (counts[i] || 0) * (st?.[k] || 0); });
  });
  return sum;
}

// Returns one row per army table: { from, headline, arrival, att, defInf, defCav, crop, diet }.
function parseIncoming(doc) {
  return [...doc.querySelectorAll('table.troop_details')].map((t) => {
    const units = [...t.querySelectorAll('tbody.units:not(.last) img.unit')]
      .map((img) => [...img.classList].find((c) => /^u(\d+|hero)$/.test(c)));
    const counts = [...t.querySelectorAll('tbody.units.last td')]
      .map((td) => parseInt(td.textContent.replace(/\D/g, ''), 10) || 0); // "?" on unscouted attacks -> 0
    const [att, defInf, defCav, crop] = tally(units, counts);
    const text = (sel) => t.querySelector(sel)?.textContent.trim().replace(/\s+/g, ' ') ?? '';
    return { from: text('thead .role'), headline: text('.troopHeadline'), arrival: text('.infos .at'), att, defInf, defCav, crop,
      diet: Math.floor(crop / 2) }; // diet artifact halves upkeep; game floors it per army (749 -> 374)
  });
}

// Stationed troops: base upkeep from the units, "with diet" = what the game shows ("Wyżywienie"),
// which already includes the active artifact and other bonuses.
function parseStationed(doc) {
  const shown = [...doc.querySelectorAll('table.troop_details')]
    .map((t) => parseInt(t.querySelector('.infos .sup .value')?.textContent.replace(/\D/g, ''), 10) || 0);
  return parseIncoming(doc).map(({ arrival, ...r }, i) => ({ ...r, diet: shown[i] }));
}

async function main(parse, label) {
  // On the last page "last" is disabled (no link), so take the highest page number shown.
  const links = [...document.querySelectorAll('.paginator a[href*="page="]')];
  const pages = Math.max(1, ...links.map((a) => +new URL(a.href).searchParams.get('page')),
    +document.querySelector('.paginator .currentPage')?.textContent || 1);
  const docs = [];
  for (let p = 1; p <= pages; p++) {
    if (pages === 1) { docs.push(document); break; }
    const url = new URL(links[0].href);
    url.searchParams.set('page', p);
    const html = await (await fetch(url, { credentials: 'include' })).text();
    docs.push(new DOMParser().parseFromString(html, 'text/html'));
  }
  const rows = docs.flatMap(parse);
  console.table(rows);
  document.querySelector('h4.spacer')?.after(renderBar(rows));
}

function renderBar(rows) {
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0).toLocaleString('pl-PL');
  // Game's own icon classes (same as in the unit description); inline-flex keeps icon and number on one line.
  const icon = (cls) => `<i class="${cls}" style="display:inline-block;vertical-align:middle;margin:0"></i>`;
  const part = (title, html) => `<span title="${title}" style="display:inline-block;margin-right:18px;white-space:nowrap">${html}</span>`;
  const box = document.createElement('div');
  box.style.cssText = 'margin:6px 0;padding:6px 10px;background:#f5ecd0;border:1px solid #c9b77d;font-weight:bold;display:flex;flex-wrap:wrap;align-items:center;line-height:20px';
  box.innerHTML = [ // numbers only, no page text, so innerHTML is safe here
    part('Zboże/h bez diety (z dietą)', `${icon('r4')} ${sum('crop')} (${sum('diet')})`),
    part('Atak', `${icon('attack_small')} ${sum('att')}`),
    part('Deff vs piechota', `${icon('defenceInfantry_small')} ${sum('defInf')}`),
    part('Deff vs jazda', `${icon('defenceCavalry_small')} ${sum('defCav')}`),
    isCW(location.hostname) ? part('Statystyki Community Week', 'CW') : '',
  ].join('');
  return box;
}

// Overview -> Troops -> Own units: one table per tribe, one row per village (units trained there, wherever they are).
function ownOverview() {
  const rows = [...document.querySelectorAll('table#troops')].flatMap((t) => {
    const units = [...t.querySelectorAll('thead img.unit')].map((img) => [...img.classList].find((c) => /^u(\d+|hero)$/.test(c)));
    return [...t.querySelectorAll('tbody tr:has(td.villageName)')].map((tr) => {
      const counts = [...tr.querySelectorAll('td:not(.villageName)')].map((td) => parseInt(td.textContent.replace(/\D/g, ''), 10) || 0);
      const [att, defInf, defCav, crop] = tally(units, counts);
      return { village: tr.querySelector('.villageName')?.textContent.trim(), att, defInf, defCav, crop, diet: Math.floor(crop / 2) };
    });
  });
  console.table(rows);
  const first = document.querySelector('table#troops');
  first?.before(renderBar(rows));
}

const active = (n) => document.querySelector(`.iconFilterActive .filterCategory${n}`);
if (typeof module !== 'undefined') module.exports = { parseIncoming, parseStationed, STATS, tally };
else if (/^\/village\/statistics\/troops(\/own)?\/?$/.test(location.pathname)) ownOverview();
else if (active(1)) main(parseIncoming, 'Zboże przychodzących oddziałów');
else if (active(3)) main(parseStationed, 'Zboże oddziałów w osadzie');
