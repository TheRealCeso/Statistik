/* Statistik Augsburg interaktiv – Anwendung (Neuauflage 2026)
 * Reine Browser-Anwendung ohne Build-Schritt. Daten liegen als JSON unter data/, Grafiken unter img/.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ Konfiguration
  const TITLES = {
    Uebersicht: 'Daten nach Geschlecht und deutsch/ausländisch',
    Altersgruppen: 'Daten nach Geschlecht und deutsch/ausländisch',
    Bevoelkerungsentwicklung: 'Übersicht Bevölkerungsentwicklung nach Geschlecht und Nationalität',
    Migration: 'Daten zum Migrationshintergrund nach Bezugsländern und Geschlecht',
    Familienstand: 'Daten zum Familienstand einer Person',
    Indikatoren: 'Daten zu demographischen Indikatoren (Durchschnittsalter, Jugendquotient u. a.)',
    Haushalte: 'Daten zur Haushaltestruktur (Personen im Haushalt, Haushaltstyp, Kinder im Haushalt)',
    Bewegung: 'Daten zu den Geburten/Sterbefällen und Zuzügen/Fortzügen',
    Beschaeftigung: 'Daten zur Beschäftigung und zu Arbeitslosen',
    BgPersonen: 'Daten zu den Bedarfsgemeinschaften',
  };
  const SUB = {
    Migration: [['MigrationshintergrundPersonen', 'nach Personen'], ['MigrationshintergrundLaender', 'nach Bezugsland']],
    Haushalte: [['Haushaltstypen', 'Haushaltstypen'], ['HaushalteNachPersonen', 'Haushalte nach Personen'], ['HaushalteNachKindern', 'Haushalte nach Kindern']],
    Bewegung: [['BewegungUebersicht', 'Übersicht'], ['BewegungNatuerlich', 'Natürliche Bevölkerungsbewegungen'], ['BewegungStadtgrenze', 'Zu-/Wegzüge'], ['BewegungInnerstaedtisch', 'Innerstädtische Umzüge']],
    BewegungV: [['BewegungNatuerlich', 'Natürliche Bevölkerungsbewegungen'], ['BewegungStadtgrenze', 'Zu-/Wegzüge'], ['BewegungInnerstaedtisch', 'Innerstädtische Umzüge']],
    Beschaeftigung: [['Beschaeftigte', 'Sozialversicherungspflichtig Beschäftigte'], ['Arbeitslose', 'Arbeitslose']],
  };
  function tabs(kind) {
    const mig = { key: 'Migration', label: 'Migrationshintergrund', subs: SUB.Migration };
    const fam = { key: 'Familienstand', label: 'Familienstand', page: 'Familienstand' };
    const ind = { key: 'Indikatoren', label: 'Indikatoren', page: 'Indikatoren' };
    const hh = { key: 'Haushalte', label: 'Haushalte', subs: SUB.Haushalte };
    const bew = { key: 'Bewegung', label: 'Bevölkerungsbewegung', subs: kind === 'vergleich' ? SUB.BewegungV : SUB.Bewegung };
    const bes = { key: 'Beschaeftigung', label: 'Beschäftigung', subs: SUB.Beschaeftigung };
    const bg = { key: 'BgPersonen', label: 'Bedarfsgemeinschaften', page: 'BgPersonen' };
    if (kind === 'select') return [{ key: 'Uebersicht', label: 'Übersicht', page: 'Uebersicht' }, mig, fam, ind, hh, bew, bes, bg];
    if (kind === 'detail') return [{ key: 'Altersgruppen', label: 'Altersgruppen', page: 'Altersgruppen' }, mig, fam, ind, hh, bew, bes, bg];
    if (kind === 'zeitreihe') return [{ key: 'Bevoelkerungsentwicklung', label: 'Bevölkerungsentwicklung', page: 'Bevoelkerungsentwicklung' }, mig, fam, ind, hh, bew, bes, bg];
    return [{ key: 'Migration', label: 'Migrationshintergrund', page: 'Migration' }, fam, ind, hh, bew, bes, bg];
  }
  const SOURCE_BA = 'Datenherkunft: Bundesagentur für Arbeit, Datenstand: jeweils zum Dezember';
  const COLOR_AREA = '#01604B';
  const COLOR_CITY = '#C8C8C8';
  const PALETTE = ['#00B0F0', '#92D050', '#FF9933', '#AE7E94', '#0070C0', '#00B050', '#847638', '#8064A2', '#E52F2F', '#3747BF', '#B22C4C', '#59A2CF'];
  // Strichmuster je Linie, damit Kurven auch ohne Farbunterscheidung trennbar bleiben
  const DASHES = ['', '7 3', '2 3', '10 3 2 3', '4 2', '1 3', '12 4', '6 2 1 2', '3 3 8 3', '2 2', '9 3 3 3', '5 4'];
  const ANKER = /AnkER/i;

  // ------------------------------------------------------------------ Hilfsfunktionen
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cell = c => (typeof c === 'string' ? { t: c } : (c || { t: '' }));
  const txt = c => cell(c).t;
  function num(s) {
    if (s == null) return null;
    s = String(txt(s)).replace(/%|je Tausend|\s/g, '').trim();
    if (s === '' || s === '.' || s === '-' || s === '–') return null;
    const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    return isNaN(v) ? null : v;
  }
  function fmt(v, d) {
    if (v == null || isNaN(v)) return '.';
    return v.toLocaleString('de-DE', { minimumFractionDigits: d == null ? 0 : d, maximumFractionDigits: d == null ? 1 : d });
  }
  function cleanVal(s) { return String(s || '').replace(/\s*%\s*%/, ' %').replace(/\s+/g, ' ').trim(); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, ''); }
  function nice(max) {
    if (!(max > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const f = max / p;
    const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * p;
  }
  // Aktuelle Darstellungseinstellung (js/a11y.js); Standardwerte, falls das Skript fehlt.
  function a11y() { return (window.A11Y && window.A11Y.get()) || { text: 'normal', contrast: 'standard', muster: 'aus' }; }
  const cache = new Map();
  async function getJSON(url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then(r => { if (!r.ok) throw new Error(url + ' (' + r.status + ')'); return r.json(); });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    return p;
  }
  async function getText(url) {
    const k = 'text:' + url;
    if (cache.has(k)) return cache.get(k);
    const p = fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.text(); });
    cache.set(k, p); return p;
  }
  function h(strings, ...vals) { return strings.reduce((a, s, i) => a + s + (i < vals.length ? vals[i] : ''), ''); }

  // ------------------------------------------------------------------ Zustand & Router
  let A = null; // areas.json
  let M = null; // maps.json
  const state = { mode: 'Detailansicht', area: 'Stadtbezirk', id: 'A', detailView: false, year: 2025, tab: '', sub: '', mk: '', adress: '' };
  function parseHash() {
    const q = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
    state.mode = ['Detailansicht', 'Zeitreihe', 'Vergleich'].includes(q.get('mode')) ? q.get('mode') : 'Detailansicht';
    state.area = A.types.includes(q.get('area')) ? q.get('area') : 'Stadtbezirk';
    state.id = q.get('id') || 'A';
    state.detailView = q.get('detailView') === 'true';
    const y = parseInt(q.get('year'), 10);
    state.year = A.years.includes(y) ? y : A.years[A.years.length - 1];
    state.tab = q.get('tab') || '';
    state.sub = q.get('sub') || '';
    state.mk = q.get('mk') || '';
    state.adress = q.get('adress') || '';
    if (state.area === 'Stadt') { state.id = 'A'; if (state.mode !== 'Vergleich') state.detailView = true; else state.area = 'Stadtbezirk'; }
    if (state.mode === 'Vergleich') state.detailView = true;
    if (state.detailView && state.mode !== 'Vergleich' && !A.areas[state.area].some(a => a.id === state.id)) state.detailView = false;
  }
  function href(patch) {
    const s = Object.assign({}, state, patch);
    const q = new URLSearchParams();
    q.set('mode', s.mode); q.set('area', s.area); q.set('id', s.id); q.set('detailView', String(s.detailView)); q.set('year', String(s.year));
    if (s.tab) q.set('tab', s.tab); if (s.sub) q.set('sub', s.sub); if (s.mk) q.set('mk', s.mk); if (s.adress) q.set('adress', s.adress);
    return '#' + q.toString();
  }
  function go(patch) { location.hash = href(patch); }
  function areaLabel(type) { return (A.menu['Area' + type] || {}).label || type; }
  function areaOf(type, id) { return (A.areas[type] || []).find(a => a.id === id); }
  function typeSingular(type) { return type === 'Stadt' ? 'Stadt' : type; }

  // ------------------------------------------------------------------ Steuerung (Kopfbereich)
  function renderControls() {
    const modes = ['Detailansicht', 'Zeitreihe', 'Vergleich'];
    const modePills = modes.map(m => {
      const mi = A.menu['Mode' + m] || { label: m, title: '' };
      const patch = m === 'Vergleich' ? { mode: m, detailView: true, area: state.area === 'Stadt' ? 'Stadtbezirk' : state.area, tab: '', sub: '', mk: '' }
        : { mode: m, detailView: state.area === 'Stadt' ? true : (state.detailView && state.mode !== 'Vergleich'), tab: '', sub: '', mk: '' };
      return h`<a class="pill ${m === state.mode ? 'is-active' : ''}" href="${href(patch)}" title="${esc(mi.title)}">${esc(mi.label)}</a>`;
    }).join('');
    const areaPills = A.types.filter(t => !(state.mode === 'Vergleich' && t === 'Stadt')).map(t => {
      const mi = A.menu['Area' + t] || { label: t, title: '' };
      const patch = t === 'Stadt' ? { area: t, id: 'A', detailView: true, tab: '', sub: '', mk: '', adress: '' }
        : { area: t, id: 'A', detailView: state.mode === 'Vergleich', tab: '', sub: '', mk: '', adress: '' };
      return h`<a class="pill ${t === state.area ? 'is-active' : ''}" href="${href(patch)}" title="${esc(mi.title)}">${esc(mi.label)}</a>`;
    }).join('');
    const yearPills = A.years.map(y => h`<a class="pill pill-year ${y === state.year ? 'is-active' : ''}" href="${href({ year: y })}">${y}</a>`).join('');
    const yearOptions = A.years.map(y => `<option value="${y}" ${y === state.year ? 'selected' : ''}>${y}</option>`).join('');
    const showYear = !(state.mode === 'Zeitreihe' && state.detailView);
    const showThemes = !state.detailView && state.mode !== 'Vergleich';
    const themePills = showThemes ? tabs('select').map(t => h`<button type="button" class="pill" data-theme="${t.key}" title="${esc(TITLES[t.key] || '')}">${esc(t.label)}</button>`).join('') : '';
    $('#controls').innerHTML = h`
      <div class="ctrl-grid">
        <div class="ctrl-group"><span class="ctrl-label">Ansicht</span><div class="pills">${modePills}</div></div>
        <div class="ctrl-group"><span class="ctrl-label">Gebietseinteilung</span><div class="pills">${areaPills}</div></div>
        ${showYear ? h`<div class="ctrl-group full"><span class="ctrl-label">Jahr</span><div class="year-nav"><div class="pills years">${yearPills}</div><select class="styled" id="yearSelect" aria-label="Jahr">${yearOptions}</select></div></div>` : ''}
        ${showThemes ? h`<div class="ctrl-group full"><span class="ctrl-label">Themenbereich</span><div class="pills">${themePills}</div></div>` : ''}
        ${showThemes ? h`<div class="ctrl-group full"><span class="ctrl-label" title="Auswahl des Teilgebiets über die Adresse">Adresssuche</span><div id="adressTop"></div></div>` : ''}
      </div>`;
    const ys = $('#yearSelect'); if (ys) ys.addEventListener('change', () => go({ year: parseInt(ys.value, 10) }));
    $$('#controls [data-theme]').forEach(b => b.addEventListener('click', () => { go({ tab: b.dataset.theme, sub: '' }); setTimeout(() => { const el = $('#tabsAnchor'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); }));
    if (showThemes) mountAdress($('#adressTop'), { big: true });
  }

  // ------------------------------------------------------------------ Tabellen
  function tableHtml(t, opts) {
    opts = opts || {};
    if (!t) return '';
    const headRows = t.head || [];
    const rows = t.rows || [];
    const grpEnd = new Set();
    if (headRows.length) { let col = 0; headRows[0].forEach(c => { col += cell(c).cs || 1; grpEnd.add(col - 1); }); }
    let html = '<div class="table-wrap"><table class="data' + (opts.compact ? ' compact' : '') + '">';
    if (headRows.length) {
      html += '<thead>';
      headRows.forEach((r, ri) => {
        html += '<tr>'; let col = 0;
        r.forEach(c => {
          c = cell(c); const cs = c.cs || 1; const end = col + cs - 1;
          const cls = [];
          if (col === 0) cls.push('lbl');
          if (grpEnd.has(end)) cls.push('grp-end');
          if (cs > 1 && ri < headRows.length - 1) cls.push('grp');
          const label = c.t.replace(/(\w)- (\w)/g, '$1$2');
          html += `<th${cs > 1 ? ` colspan="${cs}"` : ''}${c.tt ? ` title="${esc(c.tt)}"` : ''} class="${cls.join(' ')}">${c.u ? '<u>' : ''}${esc(label)}${c.u ? '</u>' : ''}</th>`;
          col += cs;
        });
        html += '</tr>';
      });
      html += '</thead>';
    }
    html += '<tbody>';
    rows.forEach(r => {
      const first = cell(r[0]);
      const sum = !!first.h || /^(summe|augsburg)$/i.test(first.t.trim());
      const link = opts.rowLink ? opts.rowLink(first.t) : null;
      const hl = opts.highlight && opts.highlight(first.t);
      html += `<tr class="${sum ? 'sum' : ''}${link ? ' linkable' : ''}${hl ? ' is-hl' : ''}"${link ? ` data-href="${esc(link)}"` : ''}>`;
      let col = 0;
      r.forEach((c, i) => {
        c = cell(c); const cs = c.cs || 1; const end = col + cs - 1;
        const cls = [];
        if (i === 0) cls.push('lbl');
        if (grpEnd.has(end)) cls.push('grp-end');
        if (c.i) cls.push('pct');
        if (/^-\d/.test(c.t)) cls.push('neg');
        if (c.al === 'l') cls.push('left');
        html += `<td${cs > 1 ? ` colspan="${cs}"` : ''} class="${cls.join(' ')}">${esc(c.t)}</td>`;
        col += cs;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }
  function legendFromTable(t) {
    // Liefert [{label, color}] aus einer Legendentabelle (Zeilen: Label + Farbzellen, ggf. mit Spaltenköpfen)
    if (!t) return [];
    const out = [];
    const rows = t.rows || [];
    const headerRow = rows.length && rows[0].every(c => !cell(c).color) ? rows[0].map(txt) : null;
    rows.forEach((r, ri) => {
      if (headerRow && ri === 0) return;
      const label = txt(r[0]);
      r.forEach((c, i) => {
        c = cell(c);
        if (c.color) {
          let l = label;
          if (headerRow && headerRow[i]) l = (label ? label + ' ' : '') + headerRow[i];
          if (!l) { const next = r[i + 1]; if (next) l = txt(next); }
          out.push({ label: l, color: '#' + c.color });
        }
      });
    });
    return out;
  }
  function legendHtml(items) {
    if (!items.length) return '';
    return '<div class="legend">' + items.map(i => {
      // Linien werden zusätzlich über das Strichmuster unterschieden, damit die Farbe
      // nicht der einzige Unterscheidungsträger ist (Farbfehlsichtigkeit).
      const sw = i.dash !== undefined
        ? `<svg class="swl" viewBox="0 0 24 10" aria-hidden="true" focusable="false"><line x1="1" y1="5" x2="23" y2="5" stroke="${esc(i.color)}" stroke-width="2.6" stroke-linecap="round"${i.dash ? ` stroke-dasharray="${esc(i.dash)}"` : ''}/></svg>`
        : `<span class="sw" style="background:${esc(i.color)}"></span>`;
      return `<span>${sw}${esc(i.label)}</span>`;
    }).join('') + '</div>';
  }
  // Farbklassen einer Vergleichskarte aus den gemessenen Kartenfarben ableiten.
  // Ergebnis je Klasse: Farbe, enthaltene Teilgebiete und beobachtete Spannweite.
  // Einige Teilgebiete bestehen aus mehreren Kartenflächen und stehen deshalb
  // mehrfach in m.areas. Für Listen und Auszählungen zählt jedes Gebiet nur einmal.
  function uniqueAreas(m) {
    const seen = new Set();
    return (m.areas || []).filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  }
  function colorClasses(m) {
    const colors = (m && m.colors) || {};
    const byColor = new Map();
    uniqueAreas(m).forEach(a => {
      const c = colors[a.id];
      // AnkER-Einrichtungen bleiben im innerstädtischen Vergleich außen vor (wie im Original)
      if (!c || ANKER.test(a.name)) return;
      let e = byColor.get(c);
      if (!e) { e = { color: c, ids: [], values: [] }; byColor.set(c, e); }
      e.ids.push(a.id);
      const v = num(a.value);
      if (v != null) e.values.push(v);
    });
    const list = Array.from(byColor.values()).map(e => {
      const vs = e.values.slice().sort((x, y) => x - y);
      e.min = vs.length ? vs[0] : null;
      e.max = vs.length ? vs[vs.length - 1] : null;
      e.mean = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
      return e;
    });
    list.sort((a, b) => a.mean - b.mean);
    list.forEach((e, i) => { e.index = i; });
    return list;
  }
  function classLegendHtml(classes, unit) {
    if (!classes.length) return '';
    const items = classes.slice().reverse().map(c => {
      const range = c.min == null ? '—' : (c.min === c.max ? fmt(c.min, 1) : fmt(c.min, 1) + ' bis ' + fmt(c.max, 1));
      const n = c.ids.length;
      return `<li><span class="sw" style="background:${esc(c.color)}"></span><span>${esc(range)}${unit ? ' ' + esc(unit) : ''} <span class="cnt">(${n} ${n === 1 ? 'Teilgebiet' : 'Teilgebiete'})</span></span></li>`;
    }).join('');
    return `<p class="small muted" style="margin:12px 0 0">Farbklassen der Karte, jeweils mit der Spannweite der enthaltenen Werte:</p><ul class="class-legend">${items}</ul>`;
  }
  function expandHeaders(t) {
    // Vollständige Spaltenbeschriftung je Spalte (Gruppe + Unterspalte)
    const head = t.head || [];
    const ncol = Math.max(...(t.rows || [[]]).map(r => r.length), ...head.map(r => r.reduce((s, c) => s + (cell(c).cs || 1), 0)));
    const labels = Array.from({ length: ncol }, () => []);
    head.forEach(r => { let col = 0; r.forEach(c => { c = cell(c); const cs = c.cs || 1; for (let k = 0; k < cs; k++) if (c.t) labels[col + k].push(c.t); col += cs; }); });
    return labels.map(l => l.join(' ').replace(/(\w)- (\w)/g, '$1$2').replace(/\s+/g, ' ').trim());
  }
  function noticeHtml(page) { return page && page.notice ? page.notice.map(n => `<div class="notice">${esc(n)}</div>`).join('') : ''; }

  // ------------------------------------------------------------------ Karten (SVG)
  function bbox(polys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    polys.forEach(p => { for (let i = 0; i < p.coords.length; i += 2) { const x = p.coords[i], y = p.coords[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } });
    return { x0, y0, x1, y1 };
  }
  // Schraffurmuster: Richtung zeigt die Lage zur Mitte der Skala, die Dichte den Abstand davon.
  // Damit ist die Klasse auch ohne Farbunterscheidung erkennbar.
  function hatchPattern(id, color, dir, gap) {
    const s = Math.round(gap * 10) / 10;
    const ink = 'rgba(8,28,21,.62)';
    const d = dir === '/'
      ? `M0,${s} L${s},0 M-1,1 L1,-1 M${s - 1},${s + 1} L${s + 1},${s - 1}`
      : `M0,0 L${s},${s} M-1,${s - 1} L1,${s + 1} M${s - 1},-1 L${s + 1},1`;
    return `<pattern id="${id}" width="${s}" height="${s}" patternUnits="userSpaceOnUse">`
      + `<rect width="${s}" height="${s}" fill="${esc(color)}"/>`
      + (dir ? `<path d="${d}" stroke="${ink}" stroke-width="1.1" fill="none" stroke-linecap="square"/>` : '')
      + '</pattern>';
  }
  let patUid = 0;
  function mapSvg(type, opts) {
    opts = opts || {};
    const mapType = type === 'Stadt' ? 'Stadtbezirk' : type;
    const m = M[mapType]; if (!m) return '';
    const polys = opts.polys || m.areas;
    const b = bbox(polys); const pad = 8;
    const vb = `${(b.x0 - pad).toFixed(1)} ${(b.y0 - pad).toFixed(1)} ${(b.x1 - b.x0 + 2 * pad).toFixed(1)} ${(b.y1 - b.y0 + 2 * pad).toFixed(1)}`;
    const classes = opts.patternClasses || [];
    const prefix = 'pat' + (++patUid) + '-';
    let defs = '';
    if (classes.length) {
      const mid = (classes.length - 1) / 2;
      defs = '<defs>' + classes.map((c, i) => {
        const dist = mid ? Math.abs(i - mid) / mid : 0;
        const dir = dist < 0.2 ? '' : (i < mid ? '\\' : '/');
        return hatchPattern(prefix + i, c.color, dir, Math.max(3.5, 9 - dist * 5.5));
      }).join('') + '</defs>';
    }
    const items = polys.map(p => {
      const id = p.id; const sel = opts.selected && opts.selected === id;
      let fill = opts.fill ? opts.fill(id) : null;
      if (classes.length && opts.classOf) { const ci = opts.classOf(id); if (ci != null) fill = `url(#${prefix}${ci})`; }
      const cls = opts.cls || 'map-area';
      return `<polygon class="${cls}${sel ? ' is-active' : ''}${opts.extraClass ? ' ' + opts.extraClass(id) : ''}" data-id="${esc(id)}" points="${p.coords.join(' ')}"${fill ? ` style="fill:${esc(fill)}"` : ''}><title>${esc(p.title)}</title></polygon>`;
    }).join('');
    return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Karte ${esc(areaLabel(mapType))}" preserveAspectRatio="xMidYMid meet">${defs}${items}</svg>`;
  }

  // ------------------------------------------------------------------ Diagramme (SVG)
  function axisTicks(max, min) {
    min = Math.min(0, min || 0);
    const span = nice(Math.max(max, Math.abs(min)) || 1);
    const step = span / 5;
    const top = Math.ceil(max / step) * step || step;
    const bottom = Math.floor(min / step) * step;
    const ticks = []; for (let v = bottom; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
    return { top, bottom, ticks, step };
  }
  function chartBars(cfg) {
    // Gruppierte Balken: cfg.groups=[{label, values:[...]}], cfg.series=[{label,color}], cfg.yLabel, cfg.xLabel
    const W = 800, Hh = 360, mL = 56, mR = 20, mT = 34, mB = 110;
    const iw = W - mL - mR, ih = Hh - mT - mB;
    const all = cfg.groups.flatMap(g => g.values).filter(v => v != null);
    const ax = axisTicks(Math.max(...all, 0), Math.min(...all, 0));
    const y = v => mT + ih - (v - ax.bottom) / (ax.top - ax.bottom || 1) * ih;
    const gw = iw / cfg.groups.length; const bw = Math.min(28, gw / (cfg.series.length + 1.5));
    let s = `<svg viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(cfg.yLabel || '')}">`;
    s += `<text x="${mL - 40}" y="${mT - 14}" font-size="12" fill="#5B6B63">${esc(cfg.yLabel || '')}</text>`;
    ax.ticks.forEach(t => { s += `<line x1="${mL}" x2="${W - mR}" y1="${y(t)}" y2="${y(t)}" stroke="#E4EBE7"/><text x="${mL - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="#5B6B63">${fmt(t, ax.step < 1 ? 1 : 0)}</text>`; });
    s += `<line x1="${mL}" x2="${W - mR}" y1="${y(0)}" y2="${y(0)}" stroke="#B9CBC1"/>`;
    cfg.groups.forEach((g, gi) => {
      const cx = mL + gw * gi + gw / 2;
      const total = cfg.series.length * bw + (cfg.series.length - 1) * 3;
      g.values.forEach((v, si) => {
        if (v == null) return;
        const x = cx - total / 2 + si * (bw + 3);
        const y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
        s += `<rect x="${x}" y="${y0}" width="${bw}" height="${Math.max(1, y1 - y0)}" fill="${cfg.series[si].color}" rx="2"><title>${esc(g.label)} – ${esc(cfg.series[si].label)}: ${fmt(v, 1)}</title></rect>`;
      });
      s += `<text transform="translate(${cx},${mT + ih + 10}) rotate(35)" font-size="11" fill="#142019" text-anchor="start">${esc(g.label)}</text>`;
    });
    if (cfg.xLabel) s += `<text x="${W - mR}" y="${Hh - 8}" text-anchor="end" font-size="12" fill="#5B6B63">${esc(cfg.xLabel)}</text>`;
    s += '</svg>';
    return `<div class="chart">${s}${legendHtml(cfg.series)}</div>`;
  }
  function chartPie(cfg) {
    const W = 380, Hh = 380, cx = 190, cy = 180, r = 130;
    const total = cfg.slices.reduce((a, b) => a + (b.value || 0), 0);
    if (!(total > 0)) return '';
    let a0 = -Math.PI / 2; let s = `<svg viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Kreisdiagramm">`;
    cfg.slices.forEach(sl => {
      const v = sl.value || 0; if (!(v > 0)) return;
      const a1 = a0 + v / total * 2 * Math.PI;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const d = v === total ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}` : `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
      s += `<path d="${d}" fill="${sl.color}" stroke="#fff" stroke-width="1"><title>${esc(sl.label)}: ${fmt(v, 0)} (${fmt(v / total * 100, 1)}%)</title></path>`;
      const am = (a0 + a1) / 2; const lx = cx + (r + 26) * Math.cos(am), ly = cy + (r + 26) * Math.sin(am);
      const anchor = Math.cos(am) > 0.2 ? 'start' : Math.cos(am) < -0.2 ? 'end' : 'middle';
      if (v / total > 0.015) s += `<text x="${lx}" y="${ly}" font-size="11" text-anchor="${anchor}" fill="#142019">${fmt(v, 0)}</text><text x="${lx}" y="${ly + 12}" font-size="10" font-style="italic" text-anchor="${anchor}" fill="#5B6B63">(${fmt(v / total * 100, 1)}%)</text>`;
      a0 = a1;
    });
    if (cfg.title) s += `<text x="${cx}" y="${Hh - 12}" text-anchor="middle" font-size="12" fill="#142019">${esc(cfg.title)}</text>`;
    s += '</svg>';
    return `<div class="chart">${s}</div>`;
  }
  function chartLines(cfg) {
    // cfg.x=[Jahre], cfg.series=[{label,color,values}], cfg.yLabel
    const W = 800, Hh = 330, mL = 60, mR = 20, mT = 30, mB = 46;
    const iw = W - mL - mR, ih = Hh - mT - mB;
    const all = cfg.series.flatMap(sr => sr.values).filter(v => v != null);
    if (!all.length) return '';
    const ax = axisTicks(Math.max(...all, 0), Math.min(...all, 0));
    const y = v => mT + ih - (v - ax.bottom) / (ax.top - ax.bottom || 1) * ih;
    const x = i => mL + (cfg.x.length > 1 ? i / (cfg.x.length - 1) * iw : iw / 2);
    let s = `<svg viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Liniendiagramm">`;
    s += `<text x="${mL - 44}" y="${mT - 12}" font-size="12" fill="#5B6B63">${esc(cfg.yLabel || 'Wert')}</text>`;
    ax.ticks.forEach(t => { s += `<line x1="${mL}" x2="${W - mR}" y1="${y(t)}" y2="${y(t)}" stroke="#E4EBE7"/><text x="${mL - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="#5B6B63">${fmt(t, ax.step < 1 ? 1 : 0)}</text>`; });
    cfg.x.forEach((xv, i) => { s += `<line x1="${x(i)}" x2="${x(i)}" y1="${mT}" y2="${mT + ih}" stroke="#F0F4F2"/><text transform="translate(${x(i)},${mT + ih + 8}) rotate(45)" font-size="10" fill="#142019">${esc(xv)}</text>`; });
    s += `<line x1="${mL}" x2="${W - mR}" y1="${y(0)}" y2="${y(0)}" stroke="#B9CBC1"/>`;
    cfg.series.forEach((sr, si) => {
      const dash = DASHES[si % DASHES.length];
      sr.dash = dash;
      let d = ''; let pen = false;
      sr.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? ' L ' : ' M ') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); pen = true; });
      s += `<path d="${d}" fill="none" stroke="${sr.color}" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
      sr.values.forEach((v, i) => { if (v == null) return; s += `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${sr.color}"><title>${esc(sr.label)} ${esc(cfg.x[i])}: ${fmt(v, 1)}</title></circle>`; });
    });
    s += `<text x="${W - mR}" y="${Hh - 4}" text-anchor="end" font-size="12" fill="#5B6B63">Jahr</text></svg>`;
    return `<div class="chart">${s}${legendHtml(cfg.series)}</div>`;
  }
  function chartAreaBars(cfg) {
    // Balken je Teilgebiet mit Linie für den Wert der Gesamtstadt
    const W = 1000, Hh = 420, mL = 56, mR = 20, mT = 40, mB = 150;
    const iw = W - mL - mR, ih = Hh - mT - mB;
    const vals = cfg.items.map(i => i.value).filter(v => v != null);
    const ax = axisTicks(Math.max(...vals, cfg.city || 0, 0), Math.min(...vals, cfg.city || 0, 0));
    const y = v => mT + ih - (v - ax.bottom) / (ax.top - ax.bottom || 1) * ih;
    const gw = iw / Math.max(1, cfg.items.length); const bw = Math.min(14, gw * 0.5);
    let s = `<svg viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Balkendiagramm ${esc(cfg.title || '')}">`;
    s += `<text x="${mL - 44}" y="${mT - 20}" font-size="12" fill="#5B6B63">${esc(cfg.yLabel || 'Wert')}</text>`;
    s += `<text x="${W / 2}" y="${mT - 20}" text-anchor="middle" font-size="13" fill="#142019">${esc(cfg.title || '')}</text>`;
    s += `<text x="${W - mR}" y="${mT - 20}" text-anchor="end" font-size="11" fill="#5B6B63">* Wert der Gesamtstadt</text>`;
    ax.ticks.forEach(t => { s += `<line x1="${mL}" x2="${W - mR}" y1="${y(t)}" y2="${y(t)}" stroke="#E4EBE7"/><text x="${mL - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="#5B6B63">${fmt(t, ax.step < 1 ? 1 : 0)}</text>`; });
    s += `<line x1="${mL}" x2="${W - mR}" y1="${y(0)}" y2="${y(0)}" stroke="#B9CBC1"/>`;
    cfg.items.forEach((it, i) => {
      const cx = mL + gw * i + gw / 2;
      if (it.value != null) { const y0 = y(Math.max(0, it.value)), y1 = y(Math.min(0, it.value)); s += `<rect x="${cx - bw / 2}" y="${y0}" width="${bw}" height="${Math.max(1, y1 - y0)}" fill="${it.color || COLOR_AREA}" rx="2"><title>${esc(it.label)}: ${esc(it.text || fmt(it.value, 1))}</title></rect>`; }
      s += `<text transform="translate(${cx},${mT + ih + 8}) rotate(50)" font-size="10" fill="#142019">${esc(it.label)}</text>`;
    });
    if (cfg.city != null) s += `<line x1="${mL}" x2="${W - mR}" y1="${y(cfg.city)}" y2="${y(cfg.city)}" stroke="#142019" stroke-width="1.2"/><text x="${W - mR + 2}" y="${y(cfg.city) + 4}" font-size="12" fill="#142019">*</text>`;
    if (cfg.xLabel) s += `<text x="${mL}" y="${Hh - 6}" font-size="12" fill="#5B6B63">${esc(cfg.xLabel)}</text>`;
    s += '</svg>';
    return `<div class="chart">${s}</div>`;
  }

  // ------------------------------------------------------------------ Diagramm-Ableitung aus Tabellen (Detailansicht)
  function compareLegend(page, areaName) {
    const lt = (page.tables || []).find(t => t.legend && /CompareWithCity/i.test(t.id));
    const items = legendFromTable(lt);
    const l1 = items[0] ? items[0].label : areaName; const l2 = items[1] ? items[1].label : 'Augsburg';
    return [{ label: l1, color: COLOR_AREA }, { label: l2, color: COLOR_CITY }];
  }
  function pctColumns(t) {
    // Indizes der Prozentspalten (kursiv) ohne die letzte "Insgesamt"-Spalte
    const row = (t.rows || [])[0] || [];
    const idx = []; row.forEach((c, i) => { if (cell(c).i) idx.push(i); });
    const labels = expandHeaders(t);
    return idx.filter(i => !/insgesamt/i.test(labels[i]) || idx.indexOf(i) < idx.length - 1).filter(i => !(i === idx[idx.length - 1] && /100,0/.test(txt(row[i]))));
  }
  function detailCharts(pageKey, page, cityPage, areaName) {
    const t = (page.tables || []).find(x => !x.legend);
    if (!t || !t.rows || !t.rows.length) return '';
    const series = compareLegend(page, areaName);
    const labels = expandHeaders(t);
    const rowArea = t.rows[0], rowCity = t.rows[1];
    const groupsFromPct = (xLabel, filter) => {
      const cols = pctColumns(t).filter(i => !filter || filter(labels[i], i));
      if (!cols.length || !rowCity) return '';
      return chartBars({ groups: cols.map(i => ({ label: labels[i].replace(/ %$/, ''), values: [num(rowArea[i]), num(rowCity[i])] })), series, yLabel: 'Anteil in %', xLabel });
    };
    switch (pageKey) {
      case 'Indikatoren': {
        if (!rowCity) return '';
        const cols = labels.map((l, i) => i).filter(i => i > 0 && num(rowArea[i]) != null);
        return chartBars({ groups: cols.map(i => ({ label: labels[i].replace(/ in %$/, ''), values: [num(rowArea[i]), num(rowCity[i])] })), series, yLabel: 'Wert', xLabel: 'Indikator' });
      }
      case 'Familienstand': {
        // Anteile je Familienstand (Spalte "Insgesamt Insgesamt"), Vergleich mit Gesamtstadt aus deren Detaildaten
        const last = labels.length - 1;
        const cityT = cityPage && (cityPage.tables || []).find(x => !x.legend);
        const sumA = t.rows.reduce((a, r) => a + (num(r[last]) || 0), 0);
        const sumC = cityT ? cityT.rows.reduce((a, r) => a + (num(r[last]) || 0), 0) : 0;
        if (!(sumA > 0)) return '';
        const groups = t.rows.map((r, i) => ({ label: txt(r[0]), values: [num(r[last]) / sumA * 100, cityT && cityT.rows[i] && sumC > 0 ? num(cityT.rows[i][last]) / sumC * 100 : null] }));
        return chartBars({ groups, series, yLabel: 'Anteil in %', xLabel: 'Familienstand' });
      }
      case 'Haushaltstypen': return groupsFromPct('Haushaltstypen');
      case 'HaushalteNachPersonen': return groupsFromPct('Haushalte nach Personen');
      case 'HaushalteNachKindern': return groupsFromPct('Haushalte nach Kindern');
      case 'MigrationshintergrundLaender': return groupsFromPct('Bezugsland', (l, i) => !/sonstige|deutsche mit/i.test(l));
      case 'Beschaeftigte': return groupsFromPct('Sozialversicherungspflichtig Beschäftigte');
      case 'Arbeitslose': return groupsFromPct('Arbeitslose');
      case 'BgPersonen': return groupsFromPct('Bedarfsgemeinschaften');
      case 'MigrationshintergrundPersonen': {
        const lt = (page.tables || []).find(x => x.legend);
        const leg = legendFromTable(lt); // [ohne m, ohne w, mit m, mit w, ausl m, ausl w]
        const sum = t.rows.find(r => /summe/i.test(txt(r[0]))) || t.rows[t.rows.length - 1];
        const idx = [1, 2, 4, 5, 7, 8];
        const slices = idx.map((ci, k) => ({ value: num(sum[ci]), color: leg[k] ? leg[k].color : PALETTE[k], label: (leg[k] ? leg[k].label : labels[ci]) }));
        const pie = chartPie({ slices, title: areaName });
        // Anteile der drei Gruppen im Vergleich zur Gesamtstadt
        const cityT = cityPage && (cityPage.tables || []).find(x => !x.legend);
        const cityRow = cityT && (cityT.rows.find(r => /summe/i.test(txt(r[0]))) || cityT.rows[cityT.rows.length - 1]);
        const totA = num(sum[12]), totC = cityRow ? num(cityRow[12]) : null;
        const groups = [[3, 'Deutsche ohne Migrationshintergrund'], [6, 'Deutsche mit Migrationshintergrund'], [9, 'Ausländer']].map(([ci, l]) => ({ label: l, values: [totA ? num(sum[ci]) / totA * 100 : null, totC ? num(cityRow[ci]) / totC * 100 : null] }));
        const bars = chartBars({ groups, series, yLabel: 'Anteil in %', xLabel: 'Migrationshintergrund' });
        return `<div class="chart-row"><div><div class="chart-title">Anteile nach Migrationshintergrund und Geschlecht</div>${pie}${legendHtml(leg)}</div><div><div class="chart-title">Vergleich mit der Gesamtstadt</div>${bars}</div></div>`;
      }
      default: return '';
    }
  }

  // ------------------------------------------------------------------ Zeitreihen-Diagramme
  function timeSeriesChart(pageKey, page) {
    const t = (page.tables || []).find(x => !x.legend);
    if (!t || !t.rows || !t.rows.length) return '';
    const labels = expandHeaders(t);
    const years = t.rows.map(r => txt(r[0]));
    const leg = legendFromTable((page.tables || []).find(x => x.legend));
    const isPct = i => t.rows.some(r => cell(r[i]).i);
    let cols = [];
    if (leg.length) {
      leg.forEach(li => {
        const n = norm(li.label);
        let best = -1;
        labels.forEach((l, i) => { if (i === 0 || best >= 0) return; const nl = norm(l); if (nl === n || nl.includes(n) || (n.length > 4 && n.includes(nl) && nl)) best = i; });
        if (best < 0) { // z. B. "Deutsche männlich" -> Spalte "Deutsche männlich"
          const parts = li.label.split(' ').map(norm).filter(Boolean);
          labels.forEach((l, i) => { if (i === 0 || best >= 0) return; const nl = norm(l); if (parts.every(p => nl.includes(p)) && !isPct(i)) best = i; });
        }
        if (best >= 0 && !cols.some(c => c.i === best)) cols.push({ i: best, label: li.label, color: li.color });
      });
    }
    if (!cols.length) {
      labels.forEach((l, i) => {
        if (i === 0 || /insgesamt|summe/i.test(l) || isPct(i)) return;
        if (t.rows.some(r => num(r[i]) != null)) cols.push({ i, label: l, color: PALETTE[cols.length % PALETTE.length] });
      });
      if (cols.length > 12) cols = cols.slice(0, 12);
    }
    const unit = cols.length && isPct(cols[0].i) ? 'Anteil in %' : 'Anzahl';
    const yLabel = pageKey === 'Indikatoren' ? 'Wert' : unit;
    return chartLines({ x: years, series: cols.map(c => ({ label: c.label, color: c.color, values: t.rows.map(r => num(r[c.i])) })), yLabel });
  }

  // ------------------------------------------------------------------ Adresssuche
  let ADR = null;
  async function loadAdressen() { if (!ADR) ADR = await getJSON('data/adressen.json'); return ADR; }
  function foundAreaFor(bezirk, key) {
    if (!bezirk) return null;
    if (state.area === 'Stadtbezirk') return areaOf('Stadtbezirk', bezirk);
    if (state.area === 'Stadt') return areaOf('Stadt', 'A');
    // adressgenaue Zuordnung für Bezirke, die in dieser Gebietseinteilung geteilt sind
    const ov = ADR.override && ADR.override[state.area];
    if (ov && key in ov) return ov[key] ? areaOf(state.area, ov[key]) : null;
    const map = ADR.mapping && ADR.mapping[state.area];
    const id = map && map[bezirk];
    return id ? areaOf(state.area, id) : null;
  }
  function adressHtml(ctx) {
    const uid = ctx.uid;
    return h`<div class="adress" id="adr-${uid}">
      <label>Straße: <input class="styled" id="adrStreet-${uid}" list="adrStreets" autocomplete="off" placeholder="Straße eingeben"></label>
      <label>Hausnummer: <input class="styled" id="adrHnr-${uid}" list="adrHnr-${uid}-list" autocomplete="off" placeholder="Nr."><datalist id="adrHnr-${uid}-list"></datalist></label>
      <span class="adress-result" id="adrResult-${uid}"></span>
    </div>`;
  }
  let adrUid = 0;
  function mountAdress(container, ctx) {
    if (!container) return;
    ctx = ctx || {}; const uid = ++adrUid;
    container.innerHTML = adressHtml({ uid });
    if (!$('#adrStreets')) { const dl = document.createElement('datalist'); dl.id = 'adrStreets'; document.body.appendChild(dl); }
    const inStreet = $('#adrStreet-' + uid), inHnr = $('#adrHnr-' + uid), res = $('#adrResult-' + uid), dlH = $('#adrHnr-' + uid + '-list');
    const ensure = async () => { const d = await loadAdressen(); const dl = $('#adrStreets'); if (!dl.children.length) dl.innerHTML = d.streetList.map(s => `<option value="${esc(s)}">`).join(''); return d; };
    inStreet.addEventListener('focus', ensure);
    const update = async () => {
      const d = await ensure();
      const st = inStreet.value.trim();
      const hn = inHnr.value.trim();
      const known = st && d.hnr[st];
      inStreet.classList.toggle('is-invalid', !!st && !known);
      dlH.innerHTML = known ? d.hnr[st].map(x => `<option value="${esc(x)}">`).join('') : '';
      const key = st + '!' + hn;
      const bez = known && hn ? d.bezirk[key] : null;
      inHnr.classList.toggle('is-invalid', !!hn && !bez);
      res.innerHTML = '';
      if (bez) {
        const a = foundAreaFor(bez, key);
        if (a) {
          const mode = state.mode === 'Vergleich' ? 'Detailansicht' : state.mode;
          const adress = st + '!' + hn;
          res.innerHTML = h`<a href="${href({ mode, id: a.id, detailView: true, tab: '', sub: '', adress })}" data-area="${esc(a.id)}">${esc(a.label || a.name)}</a>`;
          const link = res.querySelector('a');
          link.addEventListener('mouseenter', () => hoverArea(a.id, true));
          link.addEventListener('mouseleave', () => hoverArea(a.id, false));
        } else res.innerHTML = '<span class="adress-hint">Kein Teilgebiet gefunden</span>';
      }
    };
    inStreet.addEventListener('change', update); inStreet.addEventListener('input', () => { if (ADR && ADR.hnr[inStreet.value.trim()]) update(); });
    inHnr.addEventListener('change', update); inHnr.addEventListener('input', update);
    if (state.adress && state.adress.includes('!')) {
      const [st, hn] = state.adress.split('!');
      inStreet.value = st; inHnr.value = hn; update();
    }
  }
  function hoverArea(id, on) {
    $$('[data-id]').forEach(el => { if (el.dataset.id === id) el.classList.toggle('is-hover', on); });
  }

  // ------------------------------------------------------------------ Tabs
  function tabsHtml(list, active, kind) {
    return `<div class="tabs" id="tabsAnchor" role="tablist">` + list.map(t => `<button type="button" role="tab" class="tab ${t.key === active ? 'is-active' : ''}" data-tab="${esc(t.key)}" title="${esc(TITLES[t.key] || '')}" aria-selected="${t.key === active}">${esc(t.label)}</button>`).join('') + '</div>';
  }
  function subtabsHtml(subs, active) {
    return `<div class="tabs subtabs" role="tablist">` + subs.map(([k, l]) => `<button type="button" role="tab" class="tab ${k === active ? 'is-active' : ''}" data-sub="${esc(k)}" aria-selected="${k === active}">${esc(l)}</button>`).join('') + '</div>';
  }
  function resolveTab(list) {
    let tab = list.find(t => t.key === state.tab) || list[0];
    let page = tab.page, sub = '';
    if (tab.subs) { const s = tab.subs.find(x => x[0] === state.sub) || tab.subs[0]; sub = s[0]; page = s[0]; }
    return { tab, page, sub };
  }
  function bindTabs(root, extra) {
    $$('[data-tab]', root).forEach(b => b.addEventListener('click', () => go(Object.assign({ tab: b.dataset.tab, sub: '', mk: '' }, extra || {}))));
    $$('[data-sub]', root).forEach(b => b.addEventListener('click', () => go(Object.assign({ sub: b.dataset.sub, mk: '' }, extra || {}))));
    $$('tr[data-href]', root).forEach(tr => tr.addEventListener('click', e => { if (e.target.closest('a')) return; location.hash = tr.dataset.href; }));
  }
  function setFooter(tabKey) {
    $('#footerUpdated').textContent = A.footer.updated || '';
    $('#footerSource').textContent = /Beschaeftig|BgPersonen|Arbeitslose/.test(tabKey || '') ? SOURCE_BA : (A.footer.source || '');
  }

  // ------------------------------------------------------------------ Ansicht: Auswahl Teilgebiet (Detailansicht / Zeitreihe ohne Gebiet)
  async function renderSelect() {
    const type = state.area; const list = A.areas[type];
    const T = tabs('select'); const { tab, page, sub } = resolveTab(T);
    const c = $('#content');
    const mapHtml = mapSvg(type);
    const items = list.map(a => h`<li><a href="${href({ id: a.id, detailView: true, tab: '', sub: '' })}" data-id="${esc(a.id)}">${esc(a.label)}</a></li>`).join('');
    c.innerHTML = h`
      <section class="card">
        <div class="select-grid">
          <div><h2 class="section-title">Auswahl Teilgebiet</h2><p class="muted small">${esc((A.menu['Area' + type] || {}).title || '')}</p><ul class="area-list" id="areaList">${items}</ul></div>
          <div class="map-wrap" id="bigMap">${mapHtml}<div class="map-tooltip" id="mapTip"></div>
            <div class="map-tools"><a class="btn" href="${esc(A.headerLinks.strassenverzeichnis)}" target="_blank" rel="noopener">Straßenverzeichnis mit Gebietseinteilung</a></div>
          </div>
        </div>
      </section>
      <section class="card">
        <h2 class="section-title">Themenbereich</h2>
        ${tabsHtml(T, tab.key, 'select')}
        ${tab.subs ? subtabsHtml(tab.subs, sub) : ''}
        <div id="tabContent"><div class="loading">Daten werden geladen …</div></div>
      </section>`;
    bindTabs(c);
    bindMapHover(c);
    setFooter(page);
    try {
      const data = await getJSON(`data/select/${type}/${state.year}.json`);
      const pg = data.pages[page] || {};
      const t = (pg.tables || [])[0];
      const title = pg.h4 && pg.h4[0] ? pg.h4[0] : `${tab.label}${tab.subs ? ' – ' + tab.subs.find(s => s[0] === sub)[1] : ''} ${state.year}`;
      const rowLink = label => { const a = list.find(x => label.startsWith(x.id + ' ') || label === x.label); return a ? href({ id: a.id, detailView: true, tab: '', sub: '' }) : null; };
      $('#tabContent').innerHTML = `<h3 class="content-title">${esc(title)}</h3>${noticeHtml(pg)}${t ? tableHtml(t, { rowLink }) : ''}`;
      bindTabs($('#tabContent'));
    } catch (e) { $('#tabContent').innerHTML = `<div class="error">Für ${state.year} sind keine Daten verfügbar (${esc(e.message)}).</div>`; }
  }
  function bindMapHover(root) {
    const tip = $('#mapTip', root);
    $$('#areaList a', root).forEach(a => { a.addEventListener('mouseenter', () => hoverArea(a.dataset.id, true)); a.addEventListener('mouseleave', () => hoverArea(a.dataset.id, false)); });
    $$('#bigMap polygon', root).forEach(p => {
      p.addEventListener('mouseenter', () => { hoverArea(p.dataset.id, true); if (tip) { tip.textContent = p.querySelector('title').textContent; tip.style.display = 'block'; } });
      p.addEventListener('mousemove', e => { if (!tip) return; const r = $('#bigMap').getBoundingClientRect(); tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px'; });
      p.addEventListener('mouseleave', () => { hoverArea(p.dataset.id, false); if (tip) tip.style.display = 'none'; });
      p.addEventListener('click', () => go({ id: p.dataset.id, detailView: true, tab: '', sub: '' }));
    });
  }

  // ------------------------------------------------------------------ Seitenleiste (Detail / Zeitreihe)
  function sideHtml(type, id) {
    const list = A.areas[type];
    const options = list.map(a => `<option value="${esc(a.id)}" ${a.id === id ? 'selected' : ''}>${esc(a.label)}</option>`).join('');
    const mini = type === 'Stadt' ? mapSvg('Stadtbezirk', { selected: null }) : mapSvg(type, { selected: id });
    return h`<aside class="side">
      <div class="card side-select">
        ${type !== 'Stadt' ? h`<a class="btn btn-primary" href="${href({ detailView: false, tab: '', sub: '', adress: '' })}">Auswahl Teilgebiet</a>` : ''}
        <select class="styled" id="sideSelect" aria-label="Teilgebiet wählen">${options}</select>
        <div class="minimap">${mini}</div>
        <a class="btn" href="${esc(A.headerLinks.strassenverzeichnis)}" target="_blank" rel="noopener">Straßenverzeichnis mit Gebietseinteilung</a>
      </div>
      <div class="card"><span class="ctrl-label" title="Auswahl des Teilgebietes über die Adresse">Adresssuche</span><div id="adressSide"></div></div>
    </aside>`;
  }
  function bindSide(root) {
    const sel = $('#sideSelect', root);
    if (sel) {
      sel.addEventListener('change', () => go({ id: sel.value, tab: state.tab, sub: state.sub, adress: '' }));
      $$('option', sel).forEach(o => { o.addEventListener('mouseenter', () => hoverArea(o.value, true)); o.addEventListener('mouseleave', () => hoverArea(o.value, false)); });
    }
    $$('.minimap polygon', root).forEach(p => p.addEventListener('click', () => go({ id: p.dataset.id, adress: '' })));
    mountAdress($('#adressSide', root), {});
  }

  // ------------------------------------------------------------------ Ansicht: Detailansicht
  async function renderDetail() {
    const type = state.area, id = state.id; const area = areaOf(type, id);
    const T = tabs('detail'); const { tab, page, sub } = resolveTab(T);
    const c = $('#content');
    c.innerHTML = h`<div class="detail-grid"><div class="detail-main">
        <section class="card"><h2 class="page-title" id="pageTitle">${esc(typeSingular(type))} ${esc(area.id === 'A' ? '' : area.id)} <span class="q">‘${esc(area.name)}’</span> ${state.year}</h2>
          <div id="uebersicht"><div class="loading">Daten werden geladen …</div></div></section>
        <section class="card"><h2 class="section-title">Themenbereich</h2>${tabsHtml(T, tab.key, 'detail')}${tab.subs ? subtabsHtml(tab.subs, sub) : ''}<div id="tabContent"></div></section>
      </div>${sideHtml(type, id)}</div>`;
    bindTabs(c); bindSide(c); setFooter(page);
    try {
      const [d, city] = await Promise.all([getJSON(`data/detail/${type}/${id}.json`), type === 'Stadt' ? null : getJSON('data/detail/Stadt/A.json').catch(() => null)]);
      const rec = d.years[state.year];
      if (!rec) throw new Error('Für ' + state.year + ' liegen keine Daten vor.');
      const ut = rec.uebersicht && rec.uebersicht.tables && rec.uebersicht.tables[0];
      $('#uebersicht').innerHTML = `<h3 class="content-title left">${esc((rec.uebersicht.h4 && rec.uebersicht.h4[0]) || 'Einwohnerbestand ' + state.year)}</h3>${ut ? tableHtml(ut) : ''}`;
      const pg = rec.pages[page] || {};
      const cityPg = city && city.years[state.year] ? city.years[state.year].pages[page] : null;
      const title = (pg.h4 && pg.h4[0]) || `${tab.label}${tab.subs ? ' – ' + tab.subs.find(s => s[0] === sub)[1] : ''} ${state.year}`;
      let html = `<h3 class="content-title">${esc(title)}</h3>${noticeHtml(pg)}`;
      const mainT = (pg.tables || []).find(t => !t.legend);
      if (mainT) html += tableHtml(mainT);
      if (page === 'Altersgruppen' && mainT) {
        const leg = legendFromTable((pg.tables || []).find(t => t.legend));
        const yearsWithPyr = Object.keys(d.years).filter(y => d.years[y].pages.Altersgruppen && (d.years[y].pages.Altersgruppen.imgs || []).some(i => /pyramid/.test(i))).sort();
        html += `<div class="chart-row"><div class="pyramid"><div class="chart-title">Bevölkerungspyramide ${state.year}</div><img src="img/pyramid/${esc(type)}/${esc(id)}_${state.year}.gif" alt="Alterspyramide ${esc(area.name)} ${state.year}" width="375" height="416" loading="lazy" onerror="this.closest('.pyramid').innerHTML='<div class=notice>Für dieses Jahr liegt keine Bevölkerungspyramide vor.</div>'"><div class="stand">Stand: 31.12.${state.year}</div></div>
          <div><div class="chart-title">Legende</div>${legendHtml(leg)}<p><button type="button" class="btn btn-primary" id="btnPyramidAnim">Öffne Animation</button></p><p class="muted small">Die Animation zeigt die Entwicklung der Bevölkerungspyramide über die Jahre ${esc(yearsWithPyr[0] || '')} bis ${esc(yearsWithPyr[yearsWithPyr.length - 1] || '')}.</p></div></div>`;
      } else if (mainT) {
        const ch = detailCharts(page, pg, cityPg, area.name);
        if (ch) html += ch.startsWith('<div class="chart-row"') ? ch : `<div class="chart-row single">${ch}</div>`;
      }
      $('#tabContent').innerHTML = html;
      const b = $('#btnPyramidAnim'); if (b) b.addEventListener('click', () => openPyramidAnimation(type, id, area, d));
    } catch (e) { $('#tabContent').innerHTML = `<div class="error">${esc(e.message)}</div>`; $('#uebersicht').innerHTML = ''; }
  }

  // ------------------------------------------------------------------ Ansicht: Zeitreihe (Gebiet)
  async function renderZeitreihe() {
    const type = state.area, id = state.id; const area = areaOf(type, id);
    const T = tabs('zeitreihe'); const { tab, page, sub } = resolveTab(T);
    const c = $('#content');
    c.innerHTML = h`<div class="detail-grid"><div class="detail-main">
        <section class="card"><h2 class="page-title">${esc(typeSingular(type))} ${esc(area.id === 'A' ? '' : area.id)} <span class="q">‘${esc(area.name)}’</span></h2><p class="muted small" style="text-align:center">Zeitreihe ${A.years[0]} bis ${A.years[A.years.length - 1]}</p>
          <h3 class="section-title">Themenbereich</h3>${tabsHtml(T, tab.key, 'zeitreihe')}${tab.subs ? subtabsHtml(tab.subs, sub) : ''}<div id="tabContent"><div class="loading">Daten werden geladen …</div></div></section>
      </div>${sideHtml(type, id)}</div>`;
    bindTabs(c); bindSide(c); setFooter(page);
    try {
      const d = await getJSON(`data/zeitreihe/${type}/${id}.json`);
      const pg = d.pages[page] || {};
      const title = (pg.h4 && pg.h4[0]) || `${tab.label}${tab.subs ? ' – ' + tab.subs.find(s => s[0] === sub)[1] : ''}`;
      const mainT = (pg.tables || []).find(t => !t.legend);
      let html = `<h3 class="content-title">${esc(title)}</h3>${noticeHtml(pg)}`;
      if (mainT) { html += tableHtml(mainT, { compact: true }); const ch = timeSeriesChart(page, pg); if (ch) html += `<div class="chart-row single"><div><div class="chart-title">Entwicklung ${esc(title)}</div>${ch}</div></div>`; }
      else if (!pg.notice) html += '<div class="notice">Für diesen Themenbereich liegen keine Zeitreihendaten vor.</div>';
      $('#tabContent').innerHTML = html;
    } catch (e) { $('#tabContent').innerHTML = `<div class="error">${esc(e.message)}</div>`; }
  }

  // ------------------------------------------------------------------ Ansicht: Innerstädtischer Vergleich
  const vg = { pins: [] };
  function themeKeyFor(tab, sub) { return tab.subs ? sub : (tab.key === 'Migration' ? 'Migration' : tab.page); }
  function unitOf(m) {
    const v = (m.city && m.city[1]) || (m.areas[0] && m.areas[0].value) || '';
    if (/%/.test(v)) return { y: 'Personen in %', short: '%' };
    if (/tausend/i.test(v)) return { y: 'je 1.000 Einwohner', short: 'je 1.000' };
    return { y: 'Wert', short: '' };
  }
  async function renderVergleich() {
    const type = state.area; const T = tabs('vergleich'); const { tab, page, sub } = resolveTab(T);
    const themeKey = themeKeyFor(tab, sub);
    const c = $('#content');
    c.innerHTML = h`<section class="card"><h2 class="page-title">${esc(areaLabel(type))} ${state.year}</h2>
        <h3 class="section-title">Themenbereich</h3>${tabsHtml(T, tab.key, 'vergleich')}${tab.subs ? subtabsHtml(tab.subs, sub) : ''}<div id="tabContent"><div class="loading">Daten werden geladen …</div></div></section>`;
    bindTabs(c); setFooter(page);
    let data;
    try { data = await getJSON(`data/vergleich/${type}/${state.year}.json`); }
    catch (e) { $('#tabContent').innerHTML = `<div class="error">Für ${state.year} sind keine Vergleichsdaten verfügbar.</div>`; return; }
    const theme = data.themes[themeKey];
    if (!theme || !theme.radios || !theme.radios.length) {
      $('#tabContent').innerHTML = noticeHtml(theme) || `<div class="notice">Für das Jahr ${state.year} sind noch keine Daten zum Thema ${esc(tab.label)} verfügbar!</div>`;
      return;
    }
    const mk = theme.merkmale[state.mk] ? state.mk : theme.radios[0].value;
    const m = theme.merkmale[mk];
    if (!m) { $('#tabContent').innerHTML = `<div class="notice">Keine Daten für dieses Merkmal.</div>`; return; }
    const radios = `<div class="radios">` + theme.radios.map(r => `<button type="button" class="pill ${r.value === mk ? 'is-active' : ''}" data-mk="${esc(r.value)}">${esc(r.label)}</button>`).join('') + '</div>';
    const polys = data.icCoords || [];
    const byId = {}; m.areas.forEach(a => { byId[a.id] = a; });
    const colors = m.colors || {};
    const hasColors = Object.keys(colors).length > 0;
    const classes = hasColors ? colorClasses(m) : [];
    const classIdx = {}; classes.forEach(c => c.ids.forEach(id => { classIdx[id] = c.index; }));
    const musterAn = classes.length > 1 && a11y().muster === 'an';
    const mapHtml = mapSvg(type, {
      polys, cls: 'vg-area',
      fill: id => (hasColors ? (colors[id] || '#E9EEEB') : '#E9EEEB'),
      patternClasses: musterAn ? classes : null,
      classOf: id => (id in classIdx ? classIdx[id] : null),
      extraClass: id => (vg.pins[0] === id ? 'is-pin1' : vg.pins[1] === id ? 'is-pin2' : ''),
    });
    const unit = unitOf(m);
    const cityLabels = theme.cityLabels || ['Einwohner insgesamt:', m.merkmal];
    const box = (name, people, value, pinImg, cls) => `<div class="vg-box ${cls || ''}"><div class="vg-name"><span>${esc(name)}</span>${pinImg ? `<img class="pin" src="${pinImg}" alt="">` : ''}</div><div class="vg-row"><span>${esc(cityLabels[0])}</span><span>${esc(people || '')}</span></div><div class="vg-row"><span>${esc(m.merkmal || cityLabels[1])}</span><span>${esc(value || '')}</span></div></div>`;
    const html = h`
      ${radios}
      <div class="vg-grid">
        <div class="vg-map"><div class="stand">Stand: 31.12.${state.year}</div><div id="vgMap">${mapHtml}</div></div>
        <div class="vg-legend"><img src="img/legend/${esc(type)}/${esc(mk)}.png" alt="Legende ${esc(m.merkmal || mk)}, die Klassen stehen auch als Text unter der Karte" loading="lazy" onerror="this.style.display='none'"><div class="small muted" style="margin-top:6px">${esc(unit.y)}</div></div>
        <div class="vg-table"><h3>Vergleich</h3>
          ${box('Augsburg', cleanVal(m.city[0]), cleanVal(m.city[1]))}
          <div id="vgBox1"></div><div id="vgBox2"></div>
        </div>
      </div>
      ${classLegendHtml(classes, unit.short)}
      <p><button type="button" class="btn btn-primary" id="btnVgAnim">Öffne Animation</button></p>
      ${(theme.desc || []).map(dsc => `<p class="vg-desc">${esc(dsc)}</p>`).join('')}
      <p class="vg-note">* Werte beim 'Innerstädtischen Vergleich' ohne AnkER-Einrichtung</p>
      <div class="chart-row single"><div id="vgBars"></div></div>
      <details class="values"><summary>Werte aller Teilgebiete als Tabelle</summary>${tableHtml({
        head: [[{ t: typeSingular(type), h: 1 }, { t: String(cityLabels[0]).replace(/:$/, ''), h: 1 }, { t: m.merkmal || cityLabels[1], h: 1 }]],
        rows: uniqueAreas(m).map(a => [a.name, cleanVal(a.people), cleanVal(a.value)])
          .concat([[{ t: 'Augsburg', h: 1 }, cleanVal(m.city[0]), cleanVal(m.city[1])]]),
      }, { compact: true })}</details>`;
    $('#tabContent').innerHTML = html;
    $$('#tabContent [data-mk]').forEach(b => b.addEventListener('click', () => { vg.pins = []; go({ mk: b.dataset.mk }); }));
    const renderBoxes = hoverId => {
      const slot1 = vg.pins[0] || (vg.pins.length === 0 ? hoverId : null);
      const slot2 = vg.pins[1] || (vg.pins.length === 1 ? hoverId : null);
      const fill = (el, id, pinned) => {
        const a = id && byId[id];
        el.innerHTML = a ? box(a.name, cleanVal(a.people), cleanVal(a.value), pinned ? 'img/core/pushpin.gif' : 'img/core/empty.gif') : box('Teilgebiet auswählen', '', '', pinned ? 'img/core/pushpin.gif' : 'img/core/empty.gif', 'is-empty');
      };
      fill($('#vgBox1'), slot1, !!vg.pins[0]); fill($('#vgBox2'), slot2, !!vg.pins[1]);
      $$('#vgMap polygon').forEach(p => { p.classList.toggle('is-pin1', vg.pins[0] === p.dataset.id); p.classList.toggle('is-pin2', vg.pins[1] === p.dataset.id); });
    };
    renderBoxes(null);
    $$('#vgMap polygon').forEach(p => {
      p.addEventListener('mouseenter', () => renderBoxes(p.dataset.id));
      p.addEventListener('mouseleave', () => renderBoxes(null));
      p.addEventListener('click', () => { if (vg.pins.length >= 2) vg.pins = []; else if (!vg.pins.includes(p.dataset.id)) vg.pins.push(p.dataset.id); renderBoxes(p.dataset.id); });
    });
    // Balkendiagramm über alle Teilgebiete (ohne AnkER-Einrichtungen)
    const items = uniqueAreas(m).filter(a => !ANKER.test(a.name)).map(a => ({ label: a.name.replace(/^\S+\s/, ''), value: num(a.value), text: cleanVal(a.value) }));
    $('#vgBars').innerHTML = chartAreaBars({ items, city: num(m.city[1]), yLabel: unit.y, title: m.merkmal || mk, xLabel: typeSingular(type) });
    $('#btnVgAnim').addEventListener('click', () => openVergleichAnimation(type, themeKey, mk, tab, sub, theme));
  }

  // ------------------------------------------------------------------ Modale Dialoge & Animationen
  let animTimer = null;
  function openModal(title, body) {
    $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body; $('#modal').hidden = false; document.body.style.overflow = 'hidden';
  }
  function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; document.body.style.overflow = ''; if (animTimer) { clearInterval(animTimer); animTimer = null; } }
  function openPyramidAnimation(type, id, area, d) {
    const years = Object.keys(d.years).filter(y => d.years[y].pages.Altersgruppen && (d.years[y].pages.Altersgruppen.imgs || []).some(i => /pyramid/.test(i))).sort();
    if (!years.length) return;
    const leg = [{ label: 'Deutsche männlich', color: '#59A2CF' }, { label: 'Deutsche weiblich', color: '#FFABBF' }, { label: 'Ausländer männlich', color: '#3747BF' }, { label: 'Ausländer weiblich', color: '#B22C4C' }];
    openModal('Alterspyramide animiert', h`<div class="anim"><div class="anim-meta">${esc(typeSingular(type))}: ${esc(area.label || area.name)}</div>
      <div class="anim-year" id="animYear">${years[0]}</div>
      <img id="animImg" src="img/pyramidAnim/${esc(type)}/${esc(id)}_${years[0]}.gif" alt="Alterspyramide" width="375" height="416">
      <div class="anim-controls"><button type="button" class="btn btn-primary" id="animStart">Start Animation</button><button type="button" class="btn" id="animStop">Stop Animation</button><button type="button" class="btn" id="animReset">Zurücksetzen</button></div>
      ${legendHtml(leg)}</div>`);
    years.forEach(y => { const im = new Image(); im.src = `img/pyramidAnim/${type}/${id}_${y}.gif`; });
    let i = 0;
    const show = () => { $('#animYear').textContent = years[i]; $('#animImg').src = `img/pyramidAnim/${type}/${id}_${years[i]}.gif`; };
    $('#animStart').addEventListener('click', () => { if (animTimer) return; animTimer = setInterval(() => { i = (i + 1) % years.length; show(); }, 900); });
    $('#animStop').addEventListener('click', () => { clearInterval(animTimer); animTimer = null; });
    $('#animReset').addEventListener('click', () => { clearInterval(animTimer); animTimer = null; i = 0; show(); });
  }
  async function openVergleichAnimation(type, themeKey, mk, tab, sub, theme) {
    const label = (theme.radios.find(r => r.value === mk) || {}).label || mk;
    openModal('Innerstädtischer Vergleich animiert', h`<div class="anim"><div class="anim-meta">Gebietseinteilung: ${esc(areaLabel(type))} · Themenbereich: ${esc(tab.label)}${tab.subs ? ' – ' + esc(tab.subs.find(s => s[0] === sub)[1]) : ''} · Merkmal: ${esc(label)}</div>
      <div class="anim-year" id="animYear">…</div>
      <div class="anim-grid"><div id="animMap" class="vg-map"><div class="loading">Jahre werden geladen …</div></div><div class="vg-legend"><img src="img/legend/${esc(type)}/${esc(mk)}.png" alt="Legende" onerror="this.style.display='none'"></div></div>
      <div class="anim-controls"><button type="button" class="btn btn-primary" id="animStart">Start Animation</button><button type="button" class="btn" id="animStop">Stop Animation</button><button type="button" class="btn" id="animReset">Zurücksetzen</button></div></div>`);
    const frames = [];
    await Promise.all(A.years.map(async y => {
      try { const d = await getJSON(`data/vergleich/${type}/${y}.json`); const th = d.themes[themeKey]; const m = th && th.merkmale && th.merkmale[mk]; if (m && m.areas && m.areas.length) frames.push({ y, m, polys: d.icCoords }); } catch (e) { /* Jahr ohne Daten */ }
    }));
    frames.sort((a, b) => a.y - b.y);
    if (!frames.length) { $('#animMap').innerHTML = '<div class="notice">Keine Daten für die Animation.</div>'; return; }
    let i = 0;
    const show = () => {
      const f = frames[i]; $('#animYear').textContent = f.y;
      const colors = f.m.colors || {};
      if (!Object.keys(colors).length) { $('#animMap').innerHTML = `<img src="img/vergleich/${type}/${f.y}_${mk}.gif" alt="Karte ${esc(label)} ${f.y}" style="width:100%">`; return; }
      const cls = colorClasses(f.m);
      const idx = {}; cls.forEach(c => c.ids.forEach(id => { idx[id] = c.index; }));
      const pat = cls.length > 1 && a11y().muster === 'an';
      $('#animMap').innerHTML = mapSvg(type, { polys: f.polys, cls: 'vg-area', fill: id => colors[id] || '#E9EEEB', patternClasses: pat ? cls : null, classOf: id => (id in idx ? idx[id] : null) });
    };
    show();
    $('#animStart').addEventListener('click', () => { if (animTimer) return; animTimer = setInterval(() => { i = (i + 1) % frames.length; show(); }, 900); });
    $('#animStop').addEventListener('click', () => { clearInterval(animTimer); animTimer = null; });
    $('#animReset').addEventListener('click', () => { clearInterval(animTimer); animTimer = null; i = 0; show(); });
  }
  async function openDatenbeschreibung() {
    openModal('Datenbeschreibung', '<div class="loading">Wird geladen …</div>');
    try { $('#modalBody').innerHTML = await getText('data/beschreibung.html'); } catch (e) { $('#modalBody').innerHTML = '<div class="error">Die Datenbeschreibung konnte nicht geladen werden.</div>'; }
  }

  // ------------------------------------------------------------------ Rendern
  async function render() {
    parseHash();
    renderControls();
    if (state.mode === 'Vergleich') return renderVergleich();
    if (state.detailView) return state.mode === 'Zeitreihe' ? renderZeitreihe() : renderDetail();
    return renderSelect();
  }
  async function init() {
    try {
      [A, M] = await Promise.all([getJSON('data/areas.json'), getJSON('data/maps.json')]);
    } catch (e) {
      $('#content').innerHTML = '<div class="card error">Die Daten konnten nicht geladen werden. Die Seite muss über einen Webserver aufgerufen werden (z. B. <code>node serve.js</code>).</div>';
      return;
    }
    $('#btnBeschreibung').href = A.headerLinks.beschreibung || '#';
    $('#btnDatenbeschreibung').addEventListener('click', openDatenbeschreibung);
    $$('#modal [data-close]').forEach(el => el.addEventListener('click', closeModal));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
    window.addEventListener('hashchange', () => { vg.pins = []; render(); });
    // Schrift und Kontrast wirken über CSS; die Musterdarstellung muss neu gezeichnet werden.
    let muster = a11y().muster;
    document.addEventListener('a11ychange', e => {
      const neu = (e.detail || {}).muster;
      if (neu !== muster) { muster = neu; if (state.mode === 'Vergleich') render(); }
    });
    render();
  }
  init();
})();
