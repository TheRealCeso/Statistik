/*
 * Liest die Farben der Original-Choroplethenkarten (GIF, 300x400) je Teilgebiet aus
 * und schreibt sie als "colors" in die Vergleichsdaten (data/vergleich/<Typ>/<Jahr>.json).
 * Dadurch können die Karten als SVG (scharf, interaktiv) mit exakt den Originalfarben gezeichnet werden.
 * Aufruf: node colors.js [--type=Stadtbezirk] [--year=2025] [--force]
 */
const fs = require('fs');
const path = require('path');
const { GifReader } = require('omggif');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'vergleich');
const IMG = path.join(ROOT, 'img', 'vergleich');
const opt = {};
process.argv.slice(2).forEach(a => { const m = a.match(/^--([^=]+)=(.*)$/); if (m) opt[m[1]] = m[2]; else opt[a.replace(/^--/, '')] = true; });

function decodeGif(file) {
  const buf = fs.readFileSync(file);
  const r = new GifReader(buf);
  const px = new Uint8Array(r.width * r.height * 4);
  r.decodeAndBlitFrameRGBA(0, px);
  return { w: r.width, h: r.height, px };
}
function pointInPoly(x, y, c) {
  let inside = false;
  for (let i = 0, j = c.length - 2; i < c.length; j = i, i += 2) {
    const xi = c[i], yi = c[i + 1], xj = c[j], yj = c[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polyBox(c) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < c.length; i += 2) { x0 = Math.min(x0, c[i]); x1 = Math.max(x1, c[i]); y0 = Math.min(y0, c[i + 1]); y1 = Math.max(y1, c[i + 1]); }
  return { x0, y0, x1, y1 };
}
const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
function isNeutral(r, g, b) {
  // Ränder (dunkel/grau) und Hintergrund (weiß / sehr hell) ignorieren
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 12) return true; // grau/schwarz/weiß
  return false;
}
function sampleColor(img, coords) {
  const b = polyBox(coords);
  // Winzige oder entartete Flächen (z. B. AnkER-Einrichtungen) liefern nur Nachbarfarben
  if ((b.x1 - b.x0) < 2.5 || (b.y1 - b.y0) < 2.5) return null;
  const counts = new Map();
  const step = Math.max(0.5, Math.min(2, Math.sqrt((b.x1 - b.x0) * (b.y1 - b.y0)) / 25));
  for (let y = b.y0; y <= b.y1; y += step) for (let x = b.x0; x <= b.x1; x += step) {
    if (!pointInPoly(x, y, coords)) continue;
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= img.w || yi >= img.h) continue;
    const o = (yi * img.w + xi) * 4;
    const r = img.px[o], g = img.px[o + 1], bl = img.px[o + 2];
    if (isNeutral(r, g, bl)) continue;
    const k = hex(r, g, bl);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best = null, n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best;
}

let files = 0, merkmale = 0, missing = 0;
for (const type of fs.readdirSync(DATA)) {
  if (opt.type && opt.type !== type) continue;
  for (const f of fs.readdirSync(path.join(DATA, type))) {
    const year = f.replace('.json', '');
    if (opt.year && opt.year !== year) continue;
    const file = path.join(DATA, type, f);
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!j.icCoords) continue;
    let changed = false;
    for (const th of Object.values(j.themes)) {
      for (const [mk, m] of Object.entries(th.merkmale || {})) {
        if (m.colors && !opt.force) continue;
        const gif = path.join(IMG, type, `${year}_${mk}.gif`);
        if (!fs.existsSync(gif)) { missing++; continue; }
        let img; try { img = decodeGif(gif); } catch (e) { console.log('GIF-Fehler', gif, e.message); missing++; continue; }
        const colors = {};
        for (const p of j.icCoords) { const c = sampleColor(img, p.coords); if (c) colors[p.id] = c; }
        m.colors = colors; merkmale++; changed = true;
      }
    }
    if (changed) { fs.writeFileSync(file, JSON.stringify(j)); files++; }
  }
}
console.log('Dateien aktualisiert:', files, '| Merkmale eingefärbt:', merkmale, '| fehlende GIFs:', missing);
