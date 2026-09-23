/*
 * Scraper für "Statistik Augsburg interaktiv"
 * Holt alle Tabellen, Gebiete, Karten und Grafiken des Originals
 * (https://statistikinteraktiv.augsburg.de/Interaktiv/) und legt sie als JSON / Bilddateien ab.
 *
 * Aufruf:  node scrape.js <task> [Optionen]
 *   areas      Gebietslisten + Kartenpolygone            -> data/areas.json
 *   select     Übersichtstabellen (alle Gebiete, 1 Jahr)  -> data/select/<Typ>/<Jahr>.json
 *   detail     Detailansicht (1 Gebiet, alle Jahre)       -> data/detail/<Typ>/<Id>.json
 *   zeitreihe  Zeitreihen (1 Gebiet, alle Jahre)          -> data/zeitreihe/<Typ>/<Id>.json
 *   vergleich  Innerstädtischer Vergleich                 -> data/vergleich/<Typ>/<Jahr>.json
 *   images     Karten, Pyramiden, Choroplethen, Legenden  -> img/...
 *   adress     Adresssuche (Straße/Hausnummer -> Gebiet)  -> data/adressen.json
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE = 'https://statistikinteraktiv.augsburg.de/Interaktiv';
const ORIGIN = 'https://statistikinteraktiv.augsburg.de';
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const IMG = path.join(ROOT, 'img');
const YEARS = Array.from({ length: 27 }, (_, i) => 1999 + i);
const TYPES = ['Stadt', 'Stadtbezirk', 'Planungsraum', 'Sozialregion', 'Altenhilfe', 'Sozialmonitoringbezirk', 'Stadtteil', 'Stadtregion'];
const DETAIL_PAGES = ['Altersgruppen', 'MigrationshintergrundPersonen', 'MigrationshintergrundLaender', 'Familienstand', 'Indikatoren',
  'Haushaltstypen', 'HaushalteNachPersonen', 'HaushalteNachKindern', 'BewegungUebersicht', 'BewegungNatuerlich', 'BewegungStadtgrenze',
  'BewegungInnerstaedtisch', 'Beschaeftigte', 'Arbeitslose', 'BgPersonen'];
const SELECT_PAGES = ['Uebersicht'].concat(DETAIL_PAGES.filter(p => p !== 'Altersgruppen'));
const TC_PAGES = ['Bevoelkerungsentwicklung'].concat(DETAIL_PAGES.filter(p => p !== 'Altersgruppen'));
const VERGLEICH = [
  { key: 'Migration', page: 'Migrationshintergrund', ep: 'Migration', param: 'changeMigration' },
  { key: 'Familienstand', page: 'Familienstand', ep: 'Familienstand', param: 'changeFamilienstand' },
  { key: 'Indikatoren', page: 'Indikatoren', ep: 'Indicators', param: 'changeIndicator' },
  { key: 'Haushaltstypen', page: 'Haushaltstypen', ep: 'Haushaltstypen', param: 'changeHaushaltstypen' },
  { key: 'HaushalteNachPersonen', page: 'HaushalteNachPersonen', ep: 'HaushalteNachPersonen', param: 'changeHaushalteNachPersonen' },
  { key: 'HaushalteNachKindern', page: 'HaushalteNachKindern', ep: 'HaushalteNachKindern', param: 'changeHaushalteNachKindern' },
  { key: 'BewegungNatuerlich', page: 'BewegungNatuerlich', ep: 'BewegungNatuerlich', param: 'changeBewegungNatuerlich' },
  { key: 'BewegungStadtgrenze', page: 'BewegungStadtgrenze', ep: 'BewegungStadtgrenze', param: 'changeBewegungStadtgrenze' },
  { key: 'BewegungInnerstaedtisch', page: 'BewegungInnerstaedtisch', ep: 'BewegungInnerstaedtisch', param: 'changeBewegungInnerstaedtisch' },
  { key: 'Beschaeftigte', page: 'Beschaeftigte', ep: 'Beschaeftigte', param: 'changeBeschaeftigte' },
  { key: 'Arbeitslose', page: 'Arbeitslose', ep: 'Arbeitslose', param: 'changeArbeitslose' },
  { key: 'BgPersonen', page: 'BgPersonen', ep: 'BgPersonen', param: 'changeBgPersonen' },
];

const args = process.argv.slice(2);
const task = args[0];
const opt = {};
args.slice(1).forEach(a => { const m = a.match(/^--([^=]+)=(.*)$/); if (m) opt[m[1]] = m[2]; else opt[a.replace(/^--/, '')] = true; });

// ---------- Hilfsfunktionen ----------
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJson(file, obj) { mkdirp(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(obj)); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function exists(f) { return fs.existsSync(f); }
function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchRetry(url, opts = {}, tries = 6) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(60000) });
      if (r.status >= 500) throw new Error('HTTP ' + r.status);
      return r;
    } catch (e) {
      lastErr = e;
      await sleep(500 * Math.pow(2, i));
    }
  }
  throw lastErr;
}

class Session {
  constructor() { this.cookie = null; }
  async req(url, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (this.cookie) headers.Cookie = this.cookie;
    const r = await fetchRetry(url, Object.assign({}, opts, { headers }));
    const sc = r.headers.get('set-cookie');
    if (sc) { const m = sc.match(/JSESSIONID=[^;]+/); if (m) this.cookie = m[0]; }
    return r;
  }
  async withRetry(fn) {
    let lastErr;
    for (let i = 0; i < 6; i++) { try { return await fn(); } catch (e) { lastErr = e; await sleep(500 * Math.pow(2, i)); } }
    throw lastErr;
  }
  async get(url) { return this.withRetry(async () => { const r = await this.req(url); return r.text(); }); }
  async getBuffer(url) { return this.withRetry(async () => { const r = await this.req(url); if (r.status !== 200) return null; return Buffer.from(await r.arrayBuffer()); }); }
  async post(url, data) {
    const body = new URLSearchParams(data).toString();
    return this.withRetry(async () => {
      const r = await this.req(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      return r.text();
    });
  }
  async init(year, areaType) {
    await this.get(BASE + '/');
    if (areaType) await this.get(`${BASE}/JSP/main.jsp?mode=Detailansicht&area=${areaType}&id=A&detailView=false`);
    if (year) await this.post(BASE + '/JSP/param.jsp', { yearRadioButtonYear: String(year) });
  }
}

async function pool(items, n, fn) {
  let i = 0; const results = new Array(items.length);
  async function worker() {
    while (i < items.length) {
      const k = i++;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { results[k] = await fn(items[k], k); break; }
        catch (e) { log('Fehler (Versuch ' + (attempt + 1) + '):', e.message, JSON.stringify(items[k]).slice(0, 80)); await sleep(2000 * (attempt + 1)); }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return results;
}
process.on('unhandledRejection', e => log('unhandledRejection:', e && e.message));

function clean(s) { return (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); }

// ---------- HTML-Parser ----------
// Schneidet den Seitenteil mit Minikarte / Adresssuche ab (er enthält nur Navigationsmarkup)
function cutNav(html) {
  const marks = ['id="minimap"', 'id="goOverView"', 'class="searchAdressSidebar"', 'id="adressWrap"'];
  let cut = html.length;
  for (const m of marks) { const p = html.indexOf(m); if (p > 0 && p < cut) cut = p; }
  return html.slice(0, cut);
}

function parseTable($, t) {
  const $t = $(t);
  const id = $t.attr('id') || '';
  const rows = [];
  $t.find('tr').filter((i, tr) => $(tr).closest('table')[0] === t).each((i, tr) => {
    const cells = [];
    $(tr).children('td,th').each((j, td) => {
      const $td = $(td);
      const cls = $td.attr('class') || '';
      if (/^tableLine/.test(cls)) return;
      const cs = parseInt($td.attr('colspan') || '1', 10) || 1;
      const rs = parseInt($td.attr('rowspan') || '1', 10) || 1;
      const $c = $td.clone(); $c.find('br').replaceWith(' ');
      const circle = $c.find('img[src*="circle?fgcolor="]').attr('src');
      const cell = { t: clean($c.text()) };
      if (cs > 1) cell.cs = cs;
      if (rs > 1) cell.rs = rs;
      if (/H[2-4]$/.test(cls)) cell.h = 1;
      if ($td.find('i').length) cell.i = 1;
      if ($td.find('u').length) cell.u = 1;
      const tt = $td.attr('title'); if (tt) cell.tt = clean(tt);
      if (circle) cell.color = circle.match(/fgcolor=([0-9A-Fa-f]+)/)[1];
      if (/\bright\b/.test(cls)) cell.al = 'r'; else if (/\bleft\b/.test(cls)) cell.al = 'l';
      cells.push(cell);
    });
    if (cells.length && cells.some(c => c.t !== '' || c.color)) rows.push(cells);
  });
  // Kopfzeilen: führende Zeilen, in denen alle nichtleeren Zellen Kopfzellen sind
  let hEnd = 0;
  while (hEnd < rows.length && rows[hEnd].every(c => c.h || c.t === '')) hEnd++;
  const head = rows.slice(0, hEnd);
  const body = rows.slice(hEnd);
  const out = { id, head: head.map(r => r.map(cellCompact)), rows: body.map(r => r.map(cellCompact)) };
  if (/Legend/i.test(id) || (!id && rows.some(r => r.some(c => c.color)))) out.legend = 1;
  return out;
}
// kompakte Zellendarstellung: String, wenn keine Attribute nötig
function cellCompact(c) {
  const keys = Object.keys(c);
  if (keys.length === 1) return c.t;
  return c;
}

function parsePage(html, opts = {}) {
  const $ = cheerio.load(cutNav(html), { decodeEntities: true });
  const page = {};
  const h4 = $('h4').map((i, e) => clean($(e).text())).get().filter(Boolean);
  if (h4.length) page.h4 = h4;
  const sub = $('p.subHeader').map((i, e) => clean($(e).text())).get().filter(Boolean);
  if (sub.length) page.notice = sub;
  const tables = [];
  $('table').each((i, t) => { if ($(t).parents('table').length) return; tables.push(parseTable($, t)); });
  page.tables = tables.filter(t => t.rows.length || t.head.length);
  const imgs = $('img').map((i, e) => $(e).attr('src') || '').get().filter(s => /\/pics\/|Balken|cake|Linien/.test(s));
  if (imgs.length) page.imgs = imgs.map(s => s.replace(/;jsessionid=[^?]*/, '').replace(/&amp;/g, '&'));
  const radios = [];
  $('input[type=radio]').each((i, e) => {
    const $e = $(e); const name = $e.attr('name'); const value = $e.attr('value');
    if (name === 'jahr') return;
    let label = clean($e.next('a').text() || $e.next('label').text() || $e.parent().text());
    radios.push({ name, value, label });
  });
  if (radios.length) page.radios = radios;
  const subtabs = [];
  $('.subTabs a, #subTabNavigationList a').each((i, e) => { subtabs.push({ id: $(e).attr('id'), label: clean($(e).text()) }); });
  if (subtabs.length) page.subtabs = subtabs;
  const desc = $('p.innerComparisonHeader').map((i, e) => clean($(e).text())).get();
  if (desc.length) page.desc = desc;
  const sm = html.match(/\/Interaktiv\/pics\/smallMapWhite[^"']*/);
  if (sm) page.smallMap = sm[0];
  return page;
}

function parseMapAreas(html) {
  // <area title="01 Name" shape="poly" coords="..." ... href="...id=01..." onMouseOver="bigImageMap('/Interaktiv/pics/bigMapX01.gif')"
  const out = [];
  const re = /<area\s+([^>]*)>/gi; let m;
  while ((m = re.exec(html))) {
    const a = m[1];
    const title = (a.match(/title="([^"]*)"/) || [])[1] || '';
    const coords = (a.match(/coords="([^"]*)"/) || [])[1] || '';
    const id = (a.match(/[?&;]id=([^&"]+)/) || [])[1] || (a.match(/OnClick\('[^']*','[^']*','([^']*)'/) || [])[1] || '';
    const img = (a.match(/bigImageMap\('([^']*)'\)/) || [])[1] || '';
    const mo = a.match(/fillInnerComparisonTable_OnMouseOver\('table',\s*'([^']*)','([^']*)','([^']*)'\)/);
    const rec = { id, title: clean(title.replace(/&amp;/g, '&')), coords: coords.split(',').map(v => Math.round(parseFloat(v) * 100) / 100) };
    if (img) rec.img = img;
    if (mo) { rec.id = (a.match(/OnClick\('[^']*','[^']*','([^']*)'/) || [])[1] || id; rec.name = clean(mo[1]); rec.people = mo[2]; rec.value = mo[3]; }
    out.push(rec);
  }
  return out;
}

// ---------- Task: areas ----------
async function taskAreas() {
  const s = new Session(); await s.init(2025);
  const areas = {}; const maps = {};
  for (const type of TYPES) {
    if (type === 'Stadt') { areas[type] = [{ id: 'A', name: 'Augsburg' }]; continue; }
    const html = await s.get(`${BASE}/JSP/main.jsp?mode=Detailansicht&area=${type}&id=A&detailView=false`);
    const $ = cheerio.load(html);
    const list = [];
    $('#sidebar ul li a[id^=linkelement]').each((i, e) => {
      const $e = $(e);
      const href = $e.attr('href') || '';
      const id = (href.match(/[?&]id=([^&]+)/) || [])[1];
      const img = ($e.attr('onmouseover') || '').match(/bigImageMap\('([^']*)'\)/);
      list.push({ id, name: clean($e.text()).replace(/^\S+\s/, ''), label: clean($e.text()), bigImg: img ? img[1] : null });
    });
    areas[type] = list;
    const common = ($('img[name=mapImage]').attr('src') || '');
    maps[type] = { common, w: 600, h: 860, areas: parseMapAreas(html).map(a => ({ id: a.id, title: a.title, coords: a.coords })) };
    const h1 = clean($('#mainMenu.area a.selected, ul#AreaList a.selected').first().text());
    log(type, list.length, 'Gebiete,', maps[type].areas.length, 'Polygone', h1);
  }
  // Menütexte / Titel der Original-Seite
  const html = await s.get(BASE + '/');
  const $ = cheerio.load(html);
  const menu = {};
  $('ul#ModeList li a, ul#AreaList li a, #selectAreaNavigationList li a').each((i, e) => {
    const $e = $(e); menu[$e.attr('id')] = { label: clean($e.text()), title: clean($e.attr('title') || '') };
  });
  const footer = { updated: clean($('#footerWrapLeftRight').text()), source: clean($('#footerWrapRightLeft').text()) };
  writeJson(path.join(DATA, 'areas.json'), { types: TYPES, years: YEARS, areas, menu, footer, headerLinks: {
    beschreibung: $('form[action*=".pdf"]').first().attr('action'),
    strassenverzeichnis: $('form[action*="STRV"]').first().attr('action') } });
  writeJson(path.join(DATA, 'maps.json'), maps);
  log('areas.json + maps.json geschrieben');
}

function loadAreas() { return readJson(path.join(DATA, 'areas.json')); }

// ---------- Task: select (Übersicht aller Gebiete eines Typs für ein Jahr) ----------
async function taskSelect() {
  const A = loadAreas();
  const types = (opt.type ? [opt.type] : TYPES).filter(t => t !== 'Stadt');
  const years = opt.year ? [Number(opt.year)] : YEARS;
  const jobs = []; for (const t of types) for (const y of years) jobs.push({ t, y });
  await pool(jobs, Number(opt.par || 4), async ({ t, y }) => {
    const file = path.join(DATA, 'select', t, `${y}.json`);
    if (exists(file) && !opt.force) return;
    const s = new Session(); await s.init(y);
    const first = A.areas[t][0].id;
    const out = { type: t, year: y, pages: {} };
    await pool(SELECT_PAGES, 4, async p => {
      const html = await s.get(`${BASE}/JSP/content${p}.jsp?mode=Detailansicht&area=${t}&id=${first}&year=${y}&detailView=false`);
      out.pages[p] = parsePage(html);
    });
    writeJson(file, out);
    log('select', t, y);
  });
}

// ---------- Task: detail (ein Gebiet, alle Jahre) ----------
async function taskDetail() {
  const A = loadAreas();
  const types = opt.type ? [opt.type] : TYPES;
  const jobs = [];
  for (const t of types) for (const a of A.areas[t]) { if (opt.id && a.id !== opt.id) continue; jobs.push({ t, id: a.id }); }
  const years = opt.year ? [Number(opt.year)] : YEARS;
  // Sessions pro Jahr (wiederverwendet)
  const sessions = {};
  async function sess(y) { if (!sessions[y]) { const s = new Session(); await s.init(y); sessions[y] = s; } return sessions[y]; }
  for (const { t, id } of jobs) {
    const file = path.join(DATA, 'detail', t, `${id}.json`);
    let out = exists(file) ? readJson(file) : { type: t, id, years: {} };
    const todo = years.filter(y => !out.years[y] || opt.force);
    if (!todo.length) continue;
    const t0 = Date.now();
    await pool(todo, Number(opt.par || 6), async y => {
      const s = await sess(y);
      const rec = { pages: {} };
      const main = await s.get(`${BASE}/JSP/main.jsp?mode=Detailansicht&area=${t}&id=${id}&detailView=true`);
      const $ = cheerio.load(main);
      rec.title = clean($('h2.detailH2').text());
      rec.uebersicht = parsePage('<div>' + ($('#tableContainer').html() || '') + '</div>');
      const sub = clean($('p.subHeader').first().text()); if (sub) rec.uebersicht.h4 = [sub];
      await pool(DETAIL_PAGES, 5, async p => {
        const html = await s.get(`${BASE}/JSP/content${p}.jsp?mode=Detailansicht&area=${t}&id=${id}&year=${y}&detailView=true`);
        const pg = parsePage(html);
        if (pg.smallMap) { rec.smallMap = pg.smallMap; delete pg.smallMap; }
        rec.pages[p] = pg;
      });
      out.years[y] = rec;
    });
    writeJson(file, out);
    log('detail', t, id, todo.length, 'Jahre', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
}

// ---------- Task: zeitreihe (ein Gebiet, alle Jahre in einer Tabelle) ----------
async function taskZeitreihe() {
  const A = loadAreas();
  const types = opt.type ? [opt.type] : TYPES;
  const jobs = [];
  for (const t of types) for (const a of A.areas[t]) { if (opt.id && a.id !== opt.id) continue; jobs.push({ t, id: a.id }); }
  const s = new Session(); await s.init(2025);
  await pool(jobs, Number(opt.par || 4), async ({ t, id }) => {
    const file = path.join(DATA, 'zeitreihe', t, `${id}.json`);
    if (exists(file) && !opt.force) return;
    const out = { type: t, id, pages: {} };
    const main = await s.get(`${BASE}/JSP/main.jsp?mode=Zeitreihe&area=${t}&id=${id}&detailView=true`);
    out.title = clean(cheerio.load(main)('h2.detailH2').text());
    await pool(TC_PAGES, 4, async p => {
      const html = await s.get(`${BASE}/JSP/content${p}.jsp?mode=Zeitreihe&area=${t}&id=${id}&year=2025&detailView=true`);
      out.pages[p] = parsePage(html);
    });
    writeJson(file, out);
    log('zeitreihe', t, id);
  });
}

// ---------- Task: vergleich (Typ × Jahr, alle Merkmale) ----------
async function taskVergleich() {
  const A = loadAreas();
  const types = (opt.type ? [opt.type] : TYPES).filter(t => t !== 'Stadt');
  const years = opt.year ? [Number(opt.year)] : YEARS;
  const jobs = []; for (const t of types) for (const y of years) jobs.push({ t, y });
  await pool(jobs, Number(opt.par || 4), async ({ t, y }) => {
    const file = path.join(DATA, 'vergleich', t, `${y}.json`);
    if (exists(file) && !opt.force) return;
    const s = new Session(); await s.init(y);
    const out = { type: t, year: y, themes: {} };
    for (const v of VERGLEICH) {
      const html = await s.get(`${BASE}/JSP/content${v.page}.jsp?mode=Vergleich&area=${t}&id=A&year=${y}&detailView=true`);
      const page = parsePage(html);
      const theme = { radios: page.radios || [], notice: page.notice, desc: page.desc, merkmale: {} };
      const $ = cheerio.load(html);
      const mapSrc = ($('#innerComparisonMap').attr('src') || '').replace(/;jsessionid=[^?]*/, '');
      const inner = $('#tableContainer.Inner, div.Inner').first();
      const cityTable = inner.find('table').first();
      theme.cityLabels = cityTable.find('td.left').map((i, e) => clean($(e).text())).get();
      const onload = html.match(/setRadioButtons[A-Za-z]*\('(\d+)','([^']*)'\)/);
      const def = onload ? onload[2] : (theme.radios[0] || {}).value;
      const areasHtml = $('map#innerComparisonMapInfo').html() || '';
      const rec0 = parseMapAreas(areasHtml);
      if (!theme.radios.length) { out.themes[v.key] = theme; continue; }
      const cityVals = cityTable.find('td.right').map((i, e) => clean($(e).text())).get();
      theme.merkmale[def] = { img: mapSrc, city: cityVals, merkmal: clean($('#indiName0').text()), areas: rec0.map(a => ({ id: a.id, name: a.name, people: a.people, value: a.value })) };
      if (!out.icCoords && rec0.length) out.icCoords = rec0.map(a => ({ id: a.id, title: a.title, coords: a.coords }));
      for (const r of theme.radios) {
        if (r.value === def) continue;
        const txt = await s.post(`${BASE}/JSP/InnerComparison/innerComparisonLoadPage_${v.ep}.jsp`, { [v.param]: r.value });
        let j; try { j = JSON.parse(txt.trim()); } catch (e) { log('JSON-Fehler', t, y, v.key, r.value, txt.slice(0, 80)); continue; }
        const cityKey = Object.keys(j).find(k => /ValueCity$/.test(k));
        const recs = parseMapAreas(j.innerComparisonMapInfo || '');
        theme.merkmale[r.value] = {
          img: mapSrc.replace(def + '.gif', r.value + '.gif'),
          city: [cityVals[0], j[cityKey]], merkmal: j.merkmal,
          themenbereich: j.themenbereich,
          areas: recs.map(a => ({ id: a.id, name: a.name, people: a.people, value: a.value })),
        };
      }
      theme.merkmale[def].themenbereich = theme.merkmale[Object.keys(theme.merkmale)[1]] ? theme.merkmale[Object.keys(theme.merkmale)[1]].themenbereich : undefined;
      out.themes[v.key] = theme;
    }
    writeJson(file, out);
    log('vergleich', t, y);
  });
}

// ---------- Task: images ----------
async function dl(s, url, file) {
  if (exists(file) && !opt.force) return true;
  const buf = await s.getBuffer(url);
  if (!buf || buf.length < 50) return false;
  mkdirp(path.dirname(file)); fs.writeFileSync(file, buf); return true;
}
async function taskImages() {
  const A = loadAreas(); const M = readJson(path.join(DATA, 'maps.json'));
  const s = new Session(); await s.init(2025);
  const what = opt.what || 'maps,pyramids,vergleich,legends,core';
  if (what.includes('core')) {
    for (const f of ['statistik_banner.png', 'arrowUp.jpg', 'pushpin.gif', 'empty.gif', 'favicon.ico', 'down-arrow.png'])
      await dl(s, `${BASE}/corePics/${f}`, path.join(IMG, 'core', f));
    log('core ok');
  }
  if (what.includes('maps')) {
    for (const t of TYPES) {
      if (t !== 'Stadt') await dl(s, ORIGIN +M[t].common, path.join(IMG, 'maps', t, 'common.gif'));
      await pool(A.areas[t], 6, async a => {
        if (a.bigImg) await dl(s, ORIGIN +a.bigImg, path.join(IMG, 'maps', t, `big_${a.id}.gif`));
        const d = path.join(DATA, 'detail', t, `${a.id}.json`);
        if (exists(d)) { const j = readJson(d); const y = Object.values(j.years)[0]; if (y && y.smallMap) await dl(s, ORIGIN +y.smallMap, path.join(IMG, 'maps', t, `small_${a.id}.gif`)); }
      });
      log('maps', t);
    }
  }
  if (what.includes('pyramids')) {
    for (const t of TYPES) {
      for (const a of A.areas[t]) {
        const d = path.join(DATA, 'detail', t, `${a.id}.json`);
        if (!exists(d)) continue;
        const j = readJson(d);
        const jobs = [];
        for (const y of Object.keys(j.years)) {
          const pg = j.years[y].pages.Altersgruppen; if (!pg || !pg.imgs) continue;
          const src = pg.imgs.find(i => /\/pics\/pyramid/.test(i)); if (!src) continue;
          jobs.push({ y, src });
        }
        await pool(jobs, 6, async ({ y, src }) => {
          await dl(s, ORIGIN +src, path.join(IMG, 'pyramid', t, `${a.id}_${y}.gif`));
          await dl(s, ORIGIN +src.replace('/pics/pyramid', '/pics/pyramidAnimation'), path.join(IMG, 'pyramidAnim', t, `${a.id}_${y}.gif`));
        });
      }
      log('pyramids', t);
    }
  }
  if (what.includes('vergleich') || what.includes('legends')) {
    for (const t of TYPES) {
      if (t === 'Stadt') continue;
      const legendsDone = new Set();
      for (const y of YEARS) {
        const f = path.join(DATA, 'vergleich', t, `${y}.json`); if (!exists(f)) continue;
        const j = readJson(f); const jobs = [];
        for (const th of Object.values(j.themes)) for (const [mk, m] of Object.entries(th.merkmale)) {
          if (what.includes('vergleich') && m.img) jobs.push({ url: ORIGIN + m.img, file: path.join(IMG, 'vergleich', t, `${y}_${mk}.gif`) });
          if (what.includes('legends') && !legendsDone.has(mk)) { legendsDone.add(mk); jobs.push({ url: `${BASE}/overviewLegend?theme=${mk}&area=${t}`, file: path.join(IMG, 'legend', t, `${mk}.png`) }); }
        }
        await pool(jobs, 6, j2 => dl(s, j2.url, j2.file));
      }
      log('vergleich-bilder', t);
    }
  }
}

// ---------- Task: adress ----------
function encAdr(a) { return a.replace(/ß/g, '5s5').replace(/Ä/g, '5Ae5').replace(/ä/g, '5ae5').replace(/Ö/g, '5Oe5').replace(/ö/g, '5oe5').replace(/Ü/g, '5Ue5').replace(/ü/g, '5ue5').replace(/&/g, '5and5'); }
async function taskAdress() {
  const file = path.join(DATA, 'adressen.json');
  const out = exists(file) ? readJson(file) : { streets: {}, hnr: {}, bezirk: {} };
  const s = new Session(); await s.init(2025, 'Stadtbezirk');
  if (!out.streetList) {
    const txt = await s.post(BASE + '/JSP/param.jsp', { requestStreets: 'requestStreets' });
    out.streetList = txt.trim().split(',').map(x => x.trim()).filter(Boolean);
    writeJson(file, out); log('Straßen:', out.streetList.length);
  }
  // Hausnummern je Straße
  const todo = out.streetList.filter(st => !out.hnr[st]);
  let n = 0;
  await pool(todo, 6, async st => {
    const txt = await s.post(BASE + '/JSP/param.jsp', { requestHnr: encAdr(st) });
    out.hnr[st] = txt.trim() ? txt.trim().split(',').map(x => x.trim()) : [];
    if (++n % 200 === 0) { writeJson(file, out); log('Hausnummern', n, '/', todo.length); }
  });
  writeJson(file, out);
  // Stadtbezirk je Adresse
  const jobs = [];
  for (const st of out.streetList) for (const h of out.hnr[st] || []) { const k = st + '!' + h; if (!(k in out.bezirk)) jobs.push(k); }
  log('Adressen zu prüfen:', jobs.length);
  n = 0;
  await pool(jobs, 8, async k => {
    const txt = (await s.post(BASE + '/JSP/param.jsp', { searchAdress: encAdr(k) })).trim();
    const parts = txt.split('!');
    out.bezirk[k] = parts.length === 4 ? parts[2] : '';
    if (++n % 2000 === 0) { writeJson(file, out); log('Adressen', n, '/', jobs.length); }
  });
  writeJson(file, out);
  // Zuordnung Stadtbezirk -> übrige Gebietseinteilungen (per Stichprobe je Bezirk)
  out.mapping = out.mapping || {};
  const byBez = {};
  for (const [k, b] of Object.entries(out.bezirk)) { if (!b) continue; (byBez[b] = byBez[b] || []).push(k); }
  for (const t of TYPES) {
    if (t === 'Stadtbezirk' || t === 'Stadt') continue;
    if (out.mapping[t] && !opt.force) continue;
    const s2 = new Session(); await s2.init(2025, t);
    const map = {}; const conflicts = [];
    for (const [b, list] of Object.entries(byBez)) {
      const sample = []; const step = Math.max(1, Math.floor(list.length / 5));
      for (let i = 0; i < list.length && sample.length < 6; i += step) sample.push(list[i]);
      const ids = new Set();
      for (const k of sample) { const txt = (await s2.post(BASE + '/JSP/param.jsp', { searchAdress: encAdr(k) })).trim(); const p = txt.split('!'); if (p.length === 4) ids.add(p[2]); }
      if (ids.size !== 1) conflicts.push({ b, ids: [...ids] });
      map[b] = [...ids][0] || '';
    }
    out.mapping[t] = map; if (conflicts.length) out.mapping[t + '_conflicts'] = conflicts;
    log('mapping', t, Object.keys(map).length, 'Bezirke', conflicts.length ? 'KONFLIKTE: ' + JSON.stringify(conflicts) : '');
    writeJson(file, out);
  }
  log('adressen.json fertig');
}

// ---------- Task: adressfix (Bezirke, die in einer Gebietseinteilung geteilt sind, adressgenau auflösen) ----------
async function taskAdressFix() {
  const file = path.join(DATA, 'adressen.json');
  const out = readJson(file);
  out.override = out.override || {};
  for (const t of TYPES) {
    const conflicts = out.mapping && out.mapping[t + '_conflicts'];
    if (!conflicts || !conflicts.length) continue;
    const s = new Session(); await s.init(2025, t);
    out.override[t] = out.override[t] || {};
    const keys = Object.entries(out.bezirk).filter(([k, b]) => conflicts.some(c => c.b === b) && !(k in out.override[t])).map(([k]) => k);
    log('adressfix', t, keys.length, 'Adressen in geteilten Bezirken');
    let n = 0;
    await pool(keys, 6, async k => {
      const txt = (await s.post(BASE + '/JSP/param.jsp', { searchAdress: encAdr(k) })).trim();
      const p = txt.split('!');
      out.override[t][k] = p.length === 4 ? p[2] : '';
      if (++n % 500 === 0) { writeJson(file, out); log('adressfix', t, n, '/', keys.length); }
    });
    writeJson(file, out);
  }
  log('adressfix fertig');
}

(async () => {
  const t0 = Date.now();
  const tasks = { areas: taskAreas, select: taskSelect, detail: taskDetail, zeitreihe: taskZeitreihe, vergleich: taskVergleich, images: taskImages, adress: taskAdress, adressfix: taskAdressFix };
  if (!tasks[task]) { console.error('Task unbekannt. Verfügbar: ' + Object.keys(tasks).join(', ')); process.exit(1); }
  await tasks[task]();
  log('fertig in', ((Date.now() - t0) / 1000).toFixed(0), 's');
})().catch(e => { console.error(e); process.exit(1); });
